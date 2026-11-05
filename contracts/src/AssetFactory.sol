// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {AssetCompliance} from "./AssetCompliance.sol";
import {AssetRegistry} from "./AssetRegistry.sol";
import {AssetToken} from "./AssetToken.sol";
import {IAssetCompliance} from "./interfaces/IAssetCompliance.sol";

/// @title AssetFactory
/// @notice Tokenizes a new asset in one transaction: clones a share token and its compliance
///         module, mints the deed to the custodian and wires every operator role.
contract AssetFactory is AccessControl {
    bytes32 public constant ASSET_MANAGER_ROLE = keccak256("ASSET_MANAGER_ROLE");

    /// @notice Accounts that receive roles on every new asset.
    struct Operators {
        address admin; // DEFAULT_ADMIN_ROLE on token and compliance (a Safe multisig in production)
        address agent; // AGENT_ROLE: freeze, pause, forced transfer, recovery
        address issuer; // ISSUER_ROLE: the IssuanceDesk
        address valuator; // VALUATOR_ROLE
        address distributor; // DISTRIBUTOR_ROLE: treasury that deposits income
        address complianceOfficer; // COMPLIANCE_ROLE on the compliance module
        address custodian; // receives the deed NFT
    }

    struct AssetParams {
        string name;
        string symbol;
        AssetRegistry.AssetClass assetClass;
        string jurisdiction;
        string metadataURI;
        bytes32 documentHash;
        uint256 maxSupply;
        uint256 navPerShare;
        uint256 assetValue;
        bytes32 valuationReportHash;
        IAssetCompliance.Rules rules;
        uint16[] blockedCountries;
    }

    address public immutable tokenImplementation;
    address public immutable complianceImplementation;
    AssetRegistry public immutable assetRegistry;
    address public immutable identityRegistry;
    address public immutable settlementToken;

    Operators private _operators;
    address[] private _assets;

    event AssetCreated(
        uint256 indexed assetId,
        address indexed token,
        address indexed compliance,
        AssetRegistry.AssetClass assetClass,
        string name,
        string symbol
    );
    event OperatorsUpdated(Operators operators);

    error ZeroAddress();

    constructor(
        address admin,
        address tokenImplementation_,
        address complianceImplementation_,
        address assetRegistry_,
        address identityRegistry_,
        address settlementToken_,
        Operators memory operators_
    ) {
        if (
            admin == address(0) || tokenImplementation_ == address(0)
                || complianceImplementation_ == address(0) || assetRegistry_ == address(0)
                || identityRegistry_ == address(0) || settlementToken_ == address(0)
        ) revert ZeroAddress();
        tokenImplementation = tokenImplementation_;
        complianceImplementation = complianceImplementation_;
        assetRegistry = AssetRegistry(assetRegistry_);
        identityRegistry = identityRegistry_;
        settlementToken = settlementToken_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _setOperators(operators_);
    }

    function createAsset(AssetParams calldata p)
        external
        onlyRole(ASSET_MANAGER_ROLE)
        returns (address token, address compliance, uint256 assetId)
    {
        token = Clones.clone(tokenImplementation);
        compliance = Clones.clone(complianceImplementation);
        Operators memory ops = _operators;
        _assets.push(token);

        assetId = assetRegistry.registerAsset(
            ops.custodian,
            AssetRegistry.NewAsset({
                assetClass: p.assetClass,
                shareToken: token,
                documentHash: p.documentHash,
                name: p.name,
                jurisdiction: p.jurisdiction,
                metadataURI: p.metadataURI
            })
        );

        AssetCompliance(compliance)
            .initialize(
                ops.admin, ops.complianceOfficer, token, identityRegistry, p.rules, p.blockedCountries
            );
        AssetToken(token).initialize(_tokenParams(p, assetId, compliance, ops));

        // slither-disable-next-line reentrancy-events (calls go only to the registry and fresh clones)
        emit AssetCreated(assetId, token, compliance, p.assetClass, p.name, p.symbol);
    }

    function setOperators(Operators calldata operators_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setOperators(operators_);
    }

    function operators() external view returns (Operators memory) {
        return _operators;
    }

    function assetCount() external view returns (uint256) {
        return _assets.length;
    }

    function assetAt(uint256 index) external view returns (address) {
        return _assets[index];
    }

    function allAssets() external view returns (address[] memory) {
        return _assets;
    }

    function _tokenParams(AssetParams calldata p, uint256 assetId, address compliance, Operators memory ops)
        private
        view
        returns (AssetToken.InitParams memory)
    {
        return AssetToken.InitParams({
            name: p.name,
            symbol: p.symbol,
            assetId: assetId,
            assetRegistry: address(assetRegistry),
            identityRegistry: identityRegistry,
            compliance: compliance,
            settlementToken: settlementToken,
            maxSupply: p.maxSupply,
            navPerShare: p.navPerShare,
            assetValue: p.assetValue,
            valuationReportHash: p.valuationReportHash,
            admin: ops.admin,
            agent: ops.agent,
            issuer: ops.issuer,
            valuator: ops.valuator,
            distributor: ops.distributor
        });
    }

    function _setOperators(Operators memory operators_) private {
        if (
            operators_.admin == address(0) || operators_.issuer == address(0)
                || operators_.custodian == address(0)
        ) {
            revert ZeroAddress();
        }
        _operators = operators_;
        emit OperatorsUpdated(operators_);
    }
}
