import { Result, ok, err } from "neverthrow";
import {
  Address,
  encodeAbiParameters,
  erc20Abi as viemErc20Abi,
  keccak256,
  maxUint256,
  zeroAddress,
  type Chain,
  type Client,
  type Hex,
  type Transport,
} from "viem";
import { multicall, readContract } from "viem/actions";

import { adaptiveCurveIrmAbi } from "../../abis/AdaptiveCurveIrm.js";
import { erc20Abi } from "../../abis/ERC20.js";
import { irmAbi } from "../../abis/IRM.js";
import { metaMorphoAbi } from "../../abis/MetaMorpho.js";
import { morphoBlueAbi } from "../../abis/MorphoBlue.js";
import { marketV1AdapterV2Abi, vaultV2Abi } from "../../abis/VaultV2.js";
import { type Config } from "../config";
import { marketIdFromParams } from "../utils/marketId";
import { rateToApy, WAD } from "../utils/maths";
import { MarketParams, MarketState, VaultData, VaultMarketData } from "../utils/types";

import { accrueInterest, toAssetsDown } from "./helpers";

export class MorphoClient {
  private client: Client<Transport, Chain>;
  private config: Config;

  constructor(client: Client<Transport, Chain>, config: Config) {
    this.config = config;
    this.client = client;
  }

  async fetchVaultData(vaultAddress: Address): Promise<Result<VaultData, Error>> {
    try {
      // Step 1: Get withdraw queue length
      const withdrawQueueLength = await readContract(this.client, {
        address: vaultAddress,
        abi: metaMorphoAbi,
        functionName: "withdrawQueueLength",
        args: [],
      });

      // Step 2: Get all market IDs from withdraw queue using multicall
      const withdrawQueueCalls = [];
      for (let i = 0; i < Number(withdrawQueueLength); i++) {
        withdrawQueueCalls.push({
          address: vaultAddress,
          abi: metaMorphoAbi,
          functionName: "withdrawQueue",
          args: [BigInt(i)],
        } as const);
      }

      const marketIdsResults = await multicall(this.client, {
        contracts: withdrawQueueCalls,
        allowFailure: false,
      });

      const marketIds = marketIdsResults as `0x${string}`[];

      // Step 3: Batch all market data calls using multicall
      const allMarketCalls = [];
      for (const marketId of marketIds) {
        allMarketCalls.push(
          // market state
          {
            address: this.config.morpho,
            abi: morphoBlueAbi,
            functionName: "market",
            args: [marketId],
          } as const,
          // market params
          {
            address: this.config.morpho,
            abi: morphoBlueAbi,
            functionName: "idToMarketParams",
            args: [marketId],
          } as const,
          // rate at target
          {
            address: this.config.adaptiveCurveIrm,
            abi: adaptiveCurveIrmAbi,
            functionName: "rateAtTarget",
            args: [marketId],
          } as const,
          // config (supply cap)
          {
            address: vaultAddress,
            abi: metaMorphoAbi,
            functionName: "config",
            args: [marketId],
          } as const,
          // position (supply shares)
          {
            address: this.config.morpho,
            abi: morphoBlueAbi,
            functionName: "position",
            args: [marketId, vaultAddress],
          } as const,
        );
      }

      const allMarketResults = await multicall(this.client, {
        contracts: allMarketCalls,
        allowFailure: false,
      });

      // Step 4: Get decimals for all unique loan tokens using multicall
      const loanTokens = new Set<Address>();
      for (let i = 0; i < marketIds.length; i++) {
        const marketParamsIndex = i * 5 + 1;
        const marketParams = allMarketResults[marketParamsIndex] as readonly [
          Address,
          Address,
          Address,
          Address,
          bigint,
        ];
        loanTokens.add(marketParams[0]);
      }

      const decimalsCalls = Array.from(loanTokens).map(
        (token) =>
          ({
            address: token,
            abi: erc20Abi,
            functionName: "decimals",
            args: [],
          }) as const,
      );

      const decimalsResults = await multicall(this.client, {
        contracts: decimalsCalls,
        allowFailure: false,
      });

      const decimalsMap = new Map<Address, number>();
      Array.from(loanTokens).forEach((token, index) => {
        decimalsMap.set(token, Number(decimalsResults[index]));
      });

      // Step 5: Process results
      const result: VaultData = {
        vaultAddress,
        marketsData: new Map<`0x${string}`, VaultMarketData>(),
      };

      for (let i = 0; i < marketIds.length; i++) {
        const marketId = marketIds[i];
        if (!marketId) continue;
        const baseIndex = i * 5;

        const marketState = allMarketResults[baseIndex] as readonly [
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
        ];
        const marketParams = allMarketResults[baseIndex + 1] as readonly [
          Address,
          Address,
          Address,
          Address,
          bigint,
        ];
        const rateAtTarget = allMarketResults[baseIndex + 2] as bigint;
        const config = allMarketResults[baseIndex + 3] as readonly [bigint, boolean, bigint];
        const position = allMarketResults[baseIndex + 4] as readonly [bigint, bigint, bigint];

        const vaultMarketData = await this.toVaultMarketData(
          marketId,
          marketState,
          marketParams,
          rateAtTarget,
          position[0],
          config[0],
          decimalsMap,
        );
        result.marketsData.set(marketId, vaultMarketData);
      }

      return ok(result);
    } catch (error) {
      return err(new Error(`Failed to fetch vault data for ${vaultAddress}: ${String(error)}`));
    }
  }

  /**
   * VaultV2 seen through the v1 model: each market of each MorphoMarketV1AdapterV2 becomes a
   * VaultMarketData (with `adapter` set and `cap` = effective v2 cap), and the vault's own
   * token balance becomes a virtual idle market (collateral 0x0) so strategies work unchanged.
   */
  async fetchVaultV2Data(vaultAddress: Address): Promise<Result<VaultData, Error>> {
    try {
      const vault = { address: vaultAddress, abi: vaultV2Abi } as const;
      const [asset, totalAssets, adaptersLength] = await multicall(this.client, {
        contracts: [
          { ...vault, functionName: "asset" },
          { ...vault, functionName: "totalAssets" },
          { ...vault, functionName: "adaptersLength" },
        ],
        allowFailure: false,
      });

      const adapters = await multicall(this.client, {
        contracts: Array.from({ length: Number(adaptersLength) }, (_, i) => ({
          ...vault,
          functionName: "adapters" as const,
          args: [BigInt(i)] as const,
        })),
        allowFailure: false,
      });

      // Only MorphoMarketV1AdapterV2 is supported (true for all Re7 v2 vaults); any other
      // adapter type has no marketIdsLength, so the vault is skipped with a named error.
      // marketIds only lists markets the adapter currently holds, so the bot never opens new markets.
      const lengths = await multicall(this.client, {
        contracts: adapters.map((adapter) => ({
          address: adapter,
          abi: marketV1AdapterV2Abi,
          functionName: "marketIdsLength" as const,
        })),
        allowFailure: true,
      });
      const unsupported = adapters.filter((_, i) => lengths[i]?.status !== "success");
      if (unsupported.length > 0) {
        throw new Error(
          `Unsupported adapter(s) ${unsupported.join(", ")}: not a MorphoMarketV1AdapterV2`,
        );
      }
      const slots = adapters.flatMap((adapter, i) =>
        Array.from({ length: Number(lengths[i]?.result ?? 0n) }, (_, j) => ({
          adapter,
          j: BigInt(j),
        })),
      );
      const marketIds = await multicall(this.client, {
        contracts: slots.map(({ adapter, j }) => ({
          address: adapter,
          abi: marketV1AdapterV2Abi,
          functionName: "marketIds" as const,
          args: [j] as const,
        })),
        allowFailure: false,
      });

      const markets = marketIds.map((id, i) => ({ id, adapter: slots[i]?.adapter ?? zeroAddress }));
      const [idleAssets, assetDecimals] = await multicall(this.client, {
        contracts: [
          { address: asset, abi: viemErc20Abi, functionName: "balanceOf", args: [vaultAddress] },
          { address: asset, abi: viemErc20Abi, functionName: "decimals" },
        ],
        allowFailure: false,
      });
      const decimalsMap = new Map([[asset, assetDecimals]]);

      const marketCalls = [];
      for (const { id, adapter } of markets) {
        marketCalls.push(
          {
            address: this.config.morpho,
            abi: morphoBlueAbi,
            functionName: "market",
            args: [id],
          } as const,
          {
            address: this.config.morpho,
            abi: morphoBlueAbi,
            functionName: "idToMarketParams",
            args: [id],
          } as const,
          {
            address: this.config.adaptiveCurveIrm,
            abi: adaptiveCurveIrmAbi,
            functionName: "rateAtTarget",
            args: [id],
          } as const,
          {
            address: adapter,
            abi: marketV1AdapterV2Abi,
            functionName: "supplyShares",
            args: [id],
          } as const,
        );
      }
      const perMarket: readonly unknown[] = await multicall(this.client, {
        contracts: marketCalls,
        allowFailure: false,
      });
      const at = (i: number, k: number) => perMarket[i * 4 + k];
      const withParams = markets.map((market, i) => {
        const p = at(i, 1) as readonly [Address, Address, Address, Address, bigint];
        const params: MarketParams = {
          loanToken: p[0],
          collateralToken: p[1],
          oracle: p[2],
          irm: p[3],
          lltv: p[4],
        };
        return { ...market, params };
      });

      // Each market is capped on 3 ids (adapter, collateral token, market); allocate checks all.
      const capIds = await multicall(this.client, {
        contracts: withParams.map(({ adapter, params }) => ({
          address: adapter,
          abi: marketV1AdapterV2Abi,
          functionName: "ids" as const,
          args: [params] as const,
        })),
        allowFailure: false,
      });
      const capCalls = capIds.flat().flatMap((id) =>
        (["absoluteCap", "relativeCap", "allocation"] as const).map((functionName) => ({
          ...vault,
          functionName,
          args: [id] as const,
        })),
      );
      const capResults = await multicall(this.client, { contracts: capCalls, allowFailure: false });
      const capInfo = new Map<Hex, { limit: bigint; allocation: bigint }>();
      capIds.flat().forEach((id, k) => {
        const [absoluteCap, relativeCap, allocation] = capResults.slice(k * 3, k * 3 + 3) as [
          bigint,
          bigint,
          bigint,
        ];
        const relativeLimit = relativeCap >= WAD ? maxUint256 : (totalAssets * relativeCap) / WAD;
        const limit = absoluteCap < relativeLimit ? absoluteCap : relativeLimit;
        capInfo.set(id, { limit, allocation });
      });

      const result: VaultData = { vaultAddress, marketsData: new Map(), vaultType: "morpho-v2" };
      for (const [i, { id, adapter, params: marketParams }] of withParams.entries()) {
        if (marketParams.collateralToken === zeroAddress) {
          // would collide with the virtual idle market below
          throw new Error(`Adapter ${adapter} holds zero-collateral market ${id}, unsupported`);
        }
        // allocate adds (newAssets - allocation(marketId)) to every id's allocation, so the
        // market can grow to allocation(marketId) + the smallest headroom across its ids.
        const ids = (capIds[i] ?? []).map(
          (capId) => capInfo.get(capId) ?? { limit: 0n, allocation: 0n },
        );
        const headroom = ids.reduce((acc, { limit, allocation }) => {
          const room = limit > allocation ? limit - allocation : 0n;
          return room < acc ? room : acc;
        }, maxUint256);
        const recorded = capInfo.get(marketCapId(adapter, marketParams))?.allocation ?? 0n;

        const marketData = await this.toVaultMarketData(
          id,
          at(i, 0) as readonly [bigint, bigint, bigint, bigint, bigint, bigint],
          at(i, 1) as readonly [Address, Address, Address, Address, bigint],
          at(i, 2) as bigint,
          at(i, 3) as bigint,
          0n,
          decimalsMap,
        );
        // ponytail: never report cap < vaultAssets (accrued interest above the recorded
        // allocation), strategies would read it as negative deposit room
        const cap = recorded + headroom;
        marketData.cap = cap > marketData.vaultAssets ? cap : marketData.vaultAssets;
        marketData.adapter = adapter;
        result.marketsData.set(id, marketData);
      }

      const idleParams: MarketParams = {
        loanToken: asset,
        collateralToken: zeroAddress,
        oracle: zeroAddress,
        irm: zeroAddress,
        lltv: 0n,
      };
      const idleId = marketIdFromParams(idleParams);
      result.marketsData.set(idleId, {
        chainId: this.config.chain.id,
        id: idleId,
        params: idleParams,
        state: {
          totalSupplyAssets: idleAssets,
          totalSupplyShares: idleAssets,
          totalBorrowAssets: 0n,
          totalBorrowShares: 0n,
          lastUpdate: BigInt(Math.round(Date.now() / 1000)),
          fee: 0n,
        },
        cap: maxUint256,
        vaultAssets: idleAssets,
        rateAtTarget: 0n,
        apyAt100Utilization: 0n,
        loanTokenDecimals: assetDecimals,
      });

      return ok(result);
    } catch (error) {
      return err(new Error(`Failed to fetch v2 vault data for ${vaultAddress}: ${String(error)}`));
    }
  }

  private async toVaultMarketData(
    marketId: Hex,
    marketState: readonly [bigint, bigint, bigint, bigint, bigint, bigint],
    marketParams: readonly [Address, Address, Address, Address, bigint],
    rateAtTarget: bigint,
    supplyShares: bigint,
    supplyCap: bigint,
    decimalsMap: Map<Address, number>,
  ): Promise<VaultMarketData> {
    const marketStateStruct: MarketState = {
      totalSupplyAssets: marketState[0],
      totalSupplyShares: marketState[1],
      totalBorrowAssets: marketState[2],
      totalBorrowShares: marketState[3],
      lastUpdate: marketState[4],
      fee: marketState[5],
    };

    const marketParamsStruct: MarketParams = {
      loanToken: marketParams[0],
      collateralToken: marketParams[1],
      oracle: marketParams[2],
      irm: marketParams[3],
      lltv: marketParams[4],
    };

    const { marketState: accuredState, rateAtTarget: accuredRateAtTarget } = accrueInterest(
      marketStateStruct,
      rateAtTarget,
      BigInt(Math.round(Date.now() / 1000)),
    );

    const vaultAssets = toAssetsDown(
      supplyShares,
      accuredState.totalSupplyAssets,
      accuredState.totalSupplyShares,
    );

    const vaultMarketData: VaultMarketData = {
      chainId: this.config.chain.id,
      id: marketId,
      params: marketParamsStruct,
      state: accuredState,
      cap: BigInt(supplyCap),
      vaultAssets,
      rateAtTarget: accuredRateAtTarget,
      apyAt100Utilization: 0n,
      loanTokenDecimals: decimalsMap.get(marketParamsStruct.loanToken) ?? 18,
    };

    const apyResult = await this.calculateAPYAt100Utilization(vaultMarketData);
    if (apyResult.isErr()) {
      throw apyResult.error;
    }
    vaultMarketData.apyAt100Utilization = apyResult.value;
    return vaultMarketData;
  }

  private async fetchRate(vaultMarketData: VaultMarketData): Promise<Result<bigint, Error>> {
    try {
      if (vaultMarketData.params.irm === "0x0000000000000000000000000000000000000000") {
        return ok(0n);
      }

      const borrowRate = await readContract(this.client, {
        address: vaultMarketData.params.irm,
        abi: irmAbi,
        functionName: "borrowRateView",
        args: [
          {
            loanToken: vaultMarketData.params.loanToken,
            collateralToken: vaultMarketData.params.collateralToken,
            oracle: vaultMarketData.params.oracle,
            irm: vaultMarketData.params.irm,
            lltv: vaultMarketData.params.lltv,
          },
          {
            totalSupplyAssets: vaultMarketData.state.totalSupplyAssets,
            totalSupplyShares: vaultMarketData.state.totalSupplyShares,
            totalBorrowAssets: vaultMarketData.state.totalBorrowAssets,
            totalBorrowShares: vaultMarketData.state.totalBorrowShares,
            lastUpdate: vaultMarketData.state.lastUpdate,
            fee: vaultMarketData.state.fee,
          },
        ],
      });

      return ok(borrowRate);
    } catch (error) {
      return err(new Error(`Failed to fetch borrow rate: ${String(error)}`));
    }
  }

  async calculateAPY(vaultMarketData: VaultMarketData): Promise<Result<bigint, Error>> {
    try {
      const borrowRateResult = await this.fetchRate(vaultMarketData);
      if (borrowRateResult.isErr()) {
        return err(borrowRateResult.error);
      }

      const borrowApy = rateToApy(borrowRateResult.value);
      return ok(borrowApy);
    } catch (error) {
      return err(new Error(`Failed to calculate APY: ${String(error)}`));
    }
  }

  async calculateAPYAt100Utilization(
    vaultMarketData: VaultMarketData,
  ): Promise<Result<bigint, Error>> {
    try {
      // we want to remove all excess supply assets, so that utilization is 100%
      const vaultMarketDataCopy = structuredClone(vaultMarketData);
      vaultMarketDataCopy.state.totalSupplyAssets = vaultMarketDataCopy.state.totalBorrowAssets;
      vaultMarketDataCopy.state.totalSupplyShares = vaultMarketDataCopy.state.totalBorrowShares;

      return await this.calculateAPY(vaultMarketDataCopy);
    } catch (error) {
      return err(new Error(`Failed to calculate APY at 100% utilization: ${String(error)}`));
    }
  }
}

/** VaultV2 cap id of a market held by a MorphoMarketV1Adapter: keccak256(abi.encode("this/marketParams", adapter, params)) */
function marketCapId(adapter: Address, params: MarketParams): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "address" },
        {
          type: "tuple",
          components: [
            { name: "loanToken", type: "address" },
            { name: "collateralToken", type: "address" },
            { name: "oracle", type: "address" },
            { name: "irm", type: "address" },
            { name: "lltv", type: "uint256" },
          ],
        },
      ],
      ["this/marketParams", adapter, params],
    ),
  );
}
