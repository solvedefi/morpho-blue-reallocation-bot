export declare const metaMorphoFactoryAbi: readonly [{
    readonly type: "constructor";
    readonly inputs: readonly [{
        readonly name: "morpho";
        readonly type: "address";
        readonly internalType: "address";
    }];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "MORPHO";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
        readonly internalType: "address";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "createMetaMorpho";
    readonly inputs: readonly [{
        readonly name: "initialOwner";
        readonly type: "address";
        readonly internalType: "address";
    }, {
        readonly name: "initialTimelock";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }, {
        readonly name: "asset";
        readonly type: "address";
        readonly internalType: "address";
    }, {
        readonly name: "name";
        readonly type: "string";
        readonly internalType: "string";
    }, {
        readonly name: "symbol";
        readonly type: "string";
        readonly internalType: "string";
    }, {
        readonly name: "salt";
        readonly type: "bytes32";
        readonly internalType: "bytes32";
    }];
    readonly outputs: readonly [{
        readonly name: "metaMorpho";
        readonly type: "address";
        readonly internalType: "contract IMetaMorpho";
    }];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "isMetaMorpho";
    readonly inputs: readonly [{
        readonly name: "";
        readonly type: "address";
        readonly internalType: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bool";
        readonly internalType: "bool";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "event";
    readonly name: "CreateMetaMorpho";
    readonly inputs: readonly [{
        readonly name: "metaMorpho";
        readonly type: "address";
        readonly indexed: true;
        readonly internalType: "address";
    }, {
        readonly name: "caller";
        readonly type: "address";
        readonly indexed: true;
        readonly internalType: "address";
    }, {
        readonly name: "initialOwner";
        readonly type: "address";
        readonly indexed: false;
        readonly internalType: "address";
    }, {
        readonly name: "initialTimelock";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }, {
        readonly name: "asset";
        readonly type: "address";
        readonly indexed: true;
        readonly internalType: "address";
    }, {
        readonly name: "name";
        readonly type: "string";
        readonly indexed: false;
        readonly internalType: "string";
    }, {
        readonly name: "symbol";
        readonly type: "string";
        readonly indexed: false;
        readonly internalType: "string";
    }, {
        readonly name: "salt";
        readonly type: "bytes32";
        readonly indexed: false;
        readonly internalType: "bytes32";
    }];
    readonly anonymous: false;
}, {
    readonly type: "error";
    readonly name: "ZeroAddress";
    readonly inputs: readonly [];
}];
