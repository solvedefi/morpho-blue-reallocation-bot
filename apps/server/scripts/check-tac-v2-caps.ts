import {
  createPublicClient,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbiParameters,
  type Address,
  type Hex,
} from "viem";
import { readContract } from "viem/actions";

import { vaultV2Abi } from "../abis/VaultV2";
import { tac } from "../src/config/config";

interface MarketParams {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
}

function marketV1CapId(p: MarketParams, adapter: Address): Hex {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters("string,address,(address,address,address,address,uint256)"),
      ["this/marketParams", adapter, [p.loanToken, p.collateralToken, p.oracle, p.irm, p.lltv]],
    ),
  );
}

interface VaultCfg {
  address: Address;
  name: string;
  adapter: Address;
  candidateMarkets: { id: Hex; params: MarketParams }[];
}

// Re7 V2 vaults on TAC + their candidate markets, derived by filtering all TAC
// markets by `borrowedToken === vault.asset()` and `inputToken !== 0x0`.
const vaults: VaultCfg[] = [
  {
    address: "0x8F1DA931679dc2Ac59811ACe6A401c5C935A60DC",
    name: "Re7 USDT V2",
    adapter: "0x07E20Ff434D8ba9B8a68596BDeB61aE69Fb468D4",
    candidateMarkets: [
      {
        id: "0x7cbb77fd0e1d7842767142c50223b7abda9ed603172990cda3fd688b0f3ba6ee",
        params: {
          collateralToken: "0x5ced7f73b76a555ccb372cc0f0137bec5665f81e",
          loanToken: "0xaf988c3f7cb2aceabb15f96b19388a259b6c438f",
          oracle: "0xbf10ed52dd60c60e901bf022c3675303ad4a56b1",
          irm: "0x7e82b16496fa8cc04935528da7f5a2c684a3c7a3",
          lltv: 860000000000000000n,
        },
      },
      {
        id: "0xcd5d9e8708932033fc40fffb9320d9034e68913109dd31386ae3aae6d95265c0",
        params: {
          collateralToken: "0x0a72ed3c34352ab2dd912b30f2252638c873d6f0",
          loanToken: "0xaf988c3f7cb2aceabb15f96b19388a259b6c438f",
          oracle: "0xbba185027f6c62dac2d7f95cd582785e22d61738",
          irm: "0x7e82b16496fa8cc04935528da7f5a2c684a3c7a3",
          lltv: 915000000000000000n,
        },
      },
      {
        id: "0xce8dd65a891b287bc13d9774ac84563d9769295636e79be31f9482522cd1f8aa",
        params: {
          collateralToken: "0xca6328a3dac228ca16181def8811170792d659d8",
          loanToken: "0xaf988c3f7cb2aceabb15f96b19388a259b6c438f",
          oracle: "0xcb0b163717f8153877c98da3c2424b252bba8000",
          irm: "0x7e82b16496fa8cc04935528da7f5a2c684a3c7a3",
          lltv: 860000000000000000n,
        },
      },
      {
        id: "0xa60ffde82028a9ad1ccbb9fa1f70768224fbb29513191c545ff7d4943be5b0e2",
        params: {
          collateralToken: "0x61d66bc21fed820938021b06e9b2291f3fb91945",
          loanToken: "0xaf988c3f7cb2aceabb15f96b19388a259b6c438f",
          oracle: "0x5a01eece8c71bfe7fb082f4f0e833baa21f3c615",
          irm: "0x7e82b16496fa8cc04935528da7f5a2c684a3c7a3",
          lltv: 860000000000000000n,
        },
      },
      {
        id: "0xe68ff4fea9fc7bb636792158230063cbcba566a524dc83232a5f7f0e6371caf6",
        params: {
          collateralToken: "0x0a72ed3c34352ab2dd912b30f2252638c873d6f0",
          loanToken: "0xaf988c3f7cb2aceabb15f96b19388a259b6c438f",
          oracle: "0xdb6c18e962b2240f80a07f21b2a54c4c0bf643f8",
          irm: "0x7e82b16496fa8cc04935528da7f5a2c684a3c7a3",
          lltv: 915000000000000000n,
        },
      },
      {
        id: "0xf0a090519dfbb48052f7dbc143a5543dbd405e3fc174dc88078d01cfcc7117fe",
        params: {
          collateralToken: "0x4772d2e014f9fc3a820c444e3313968e9a5c8121",
          loanToken: "0xaf988c3f7cb2aceabb15f96b19388a259b6c438f",
          oracle: "0x89401aa18e505fc36f533f96b15f1138dc848503",
          irm: "0x7e82b16496fa8cc04935528da7f5a2c684a3c7a3",
          lltv: 915000000000000000n,
        },
      },
      {
        id: "0xfb575234e6167abe5e47b74e4a05d087097f033b87fe0ff1695e51f92b9c35c2",
        params: {
          collateralToken: "0x7048c9e4abd0cf0219e95a17a8c6908dfc4f0ee4",
          loanToken: "0xaf988c3f7cb2aceabb15f96b19388a259b6c438f",
          oracle: "0x5ac74541853e610378a5dedf4f57866cb37de159",
          irm: "0x7e82b16496fa8cc04935528da7f5a2c684a3c7a3",
          lltv: 860000000000000000n,
        },
      },
    ],
  },
  {
    address: "0x47D45B47399Ccea4a89D696Aef79FF8584340334",
    name: "Re7 cbBTC V2",
    adapter: "0xeF119d2a5127Fd3585E06027f6f999165CcB88e6",
    candidateMarkets: [
      {
        id: "0x436dcdf00ed740ddccfa6e949e88d3d4f85908fb9d7814b4224861a027ce3fad",
        params: {
          collateralToken: "0xca6328a3dac228ca16181def8811170792d659d8",
          loanToken: "0x7048c9e4abd0cf0219e95a17a8c6908dfc4f0ee4",
          oracle: "0x5ac74541853e610378a5dedf4f57866cb37de159",
          irm: "0x7e82b16496fa8cc04935528da7f5a2c684a3c7a3",
          lltv: 860000000000000000n,
        },
      },
      {
        id: "0x64d739f9ec6bbbb5b026ce920bb2741a4dd712e995ebf87bee6aa9a134f7a33d",
        params: {
          collateralToken: "0xecac9c5f704e954931349da37f60e39f515c11c1",
          loanToken: "0x7048c9e4abd0cf0219e95a17a8c6908dfc4f0ee4",
          oracle: "0x0d1662340e4d1bf164cf27d66b5e86a603cbd052",
          irm: "0x7e82b16496fa8cc04935528da7f5a2c684a3c7a3",
          lltv: 915000000000000000n,
        },
      },
      {
        id: "0x7c12126e3ac2d19ecbcfff950368c14a776fbb2200c569f0c4bfe907b29467f4",
        params: {
          collateralToken: "0xecac9c5f704e954931349da37f60e39f515c11c1",
          loanToken: "0x7048c9e4abd0cf0219e95a17a8c6908dfc4f0ee4",
          oracle: "0x3f3fb6f80c1fa8f9e4231be7727146614084cb40",
          irm: "0x7e82b16496fa8cc04935528da7f5a2c684a3c7a3",
          lltv: 915000000000000000n,
        },
      },
    ],
  },
  {
    address: "0x657f5dd51D71cFbEa847fDECbca5b3fd0b82541D",
    name: "Re7 wETH V2",
    adapter: "0x4ed541BaD86A8B9c44d58ac7Ad2cAe7A01b92f38",
    candidateMarkets: [
      {
        id: "0x0c907abc875798b6b0dbbe8597dad50a1f428da3a1563ea38b0ef4576340a03a",
        params: {
          collateralToken: "0x37d6382b6889ccef8d6871a8b60e667115eddbcf",
          loanToken: "0x61d66bc21fed820938021b06e9b2291f3fb91945",
          oracle: "0xbd02d3817b26392cf637f9a84dc0c2c3b99c2186",
          irm: "0x7e82b16496fa8cc04935528da7f5a2c684a3c7a3",
          lltv: 915000000000000000n,
        },
      },
      {
        id: "0xd623ec99ea6b57f44191d91668334ebfa8d94c746baeb21400eb90672bfbc3a7",
        params: {
          collateralToken: "0x5448bbf60ee2edbcd32f032f3294982f4ad1119e",
          loanToken: "0x61d66bc21fed820938021b06e9b2291f3fb91945",
          oracle: "0x9013dfa50a0463a0c5cad6a267dd50f99ece2bd5",
          irm: "0x7e82b16496fa8cc04935528da7f5a2c684a3c7a3",
          lltv: 945000000000000000n,
        },
      },
      {
        id: "0xd77968fb56b371da1b3e78d816911b73bf0ceacca3ed721612cd01aae59f1c36",
        params: {
          collateralToken: "0xca6328a3dac228ca16181def8811170792d659d8",
          loanToken: "0x61d66bc21fed820938021b06e9b2291f3fb91945",
          oracle: "0xd5317ade25424399039c11490a107bc6e15944c7",
          irm: "0x7e82b16496fa8cc04935528da7f5a2c684a3c7a3",
          lltv: 915000000000000000n,
        },
      },
      {
        id: "0xe8e4b58ede8970b1920f6ec27305f2b8efd8af3cf5e1e3f4d9e57dd23acb6203",
        params: {
          collateralToken: "0xaf368c91793cb22739386dfcbbb2f1a9e4bcbebf",
          loanToken: "0x61d66bc21fed820938021b06e9b2291f3fb91945",
          oracle: "0xa686931886e6d7cebd10186886d1b6ee2a43e7d4",
          irm: "0x7e82b16496fa8cc04935528da7f5a2c684a3c7a3",
          lltv: 945000000000000000n,
        },
      },
    ],
  },
];

async function main() {
  const rpcUrl = process.env.RPC_URL_239 ?? tac.rpcUrls.default.http[0];
  const client = createPublicClient({ chain: tac, transport: http(rpcUrl) });
  console.log(`RPC: ${rpcUrl}\n`);

  for (const v of vaults) {
    console.log(`=== ${v.name} (${v.address}) ===`);
    for (const m of v.candidateMarkets) {
      const id = marketV1CapId(m.params, v.adapter);
      try {
        const [absCap, relCap] = await Promise.all([
          readContract(client, {
            address: v.address,
            abi: vaultV2Abi,
            functionName: "absoluteCap",
            args: [id],
          }),
          readContract(client, {
            address: v.address,
            abi: vaultV2Abi,
            functionName: "relativeCap",
            args: [id],
          }),
        ]);
        const flag = absCap > 0n || relCap > 0n ? "✓" : "·";
        console.log(
          `  ${flag} market ${m.id}\n      absCap: ${absCap.toString()}\n      relCap: ${relCap.toString()}`,
        );
      } catch (err) {
        console.error(`  ✗ market ${m.id}: ${(err as Error).message.split("\n")[0] ?? "?"}`);
      }
    }
    console.log();
  }
}

void main();
