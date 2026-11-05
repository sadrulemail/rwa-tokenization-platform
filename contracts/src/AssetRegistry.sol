// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title AssetRegistry
/// @notice One ERC-721 "deed" per tokenized asset, held by the custodian (the SPV or trustee that
///         legally owns the asset). The deed records the asset class, jurisdiction, document hash,
///         lifecycle status and the ERC-20 share token that fractionalises it.
/// @dev Deeds cannot be traded. Only the platform admin can move custody to a new custodian.
contract AssetRegistry is ERC721, AccessControl {
    /// @notice Registers new assets. Held by AssetFactory.
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    /// @notice Updates documents and lifecycle status.
    bytes32 public constant RECORDS_ROLE = keccak256("RECORDS_ROLE");

    enum AssetClass {
        RealEstate,
        PrivateCredit,
        InvestmentFund
    }

    enum AssetStatus {
        Active,
        Suspended,
        Retired
    }

    struct AssetRecord {
        AssetClass assetClass;
        AssetStatus status;
        uint64 createdAt;
        address shareToken;
        bytes32 documentHash;
        string name;
        string jurisdiction;
        string metadataURI;
    }

    struct NewAsset {
        AssetClass assetClass;
        address shareToken;
        bytes32 documentHash;
        string name;
        string jurisdiction;
        string metadataURI;
    }

    uint256 public totalAssets;
    mapping(uint256 assetId => AssetRecord) private _assets;
    mapping(address shareToken => uint256) public assetIdOf;
    bool private _custodyChange;

    event AssetRegistered(
        uint256 indexed assetId, address indexed shareToken, address indexed custodian, AssetClass assetClass
    );
    event AssetStatusChanged(uint256 indexed assetId, AssetStatus status);
    event AssetDocumentsUpdated(uint256 indexed assetId, string metadataURI, bytes32 documentHash);
    event CustodyTransferred(uint256 indexed assetId, address indexed from, address indexed to);

    error ZeroAddress();
    error UnknownAsset(uint256 assetId);
    error TokenAlreadyRegistered(address shareToken);
    error DeedTransferRestricted();

    constructor(address admin) ERC721("RWA Asset Deed", "DEED") {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function registerAsset(address custodian, NewAsset calldata asset)
        external
        onlyRole(REGISTRAR_ROLE)
        returns (uint256 assetId)
    {
        if (custodian == address(0) || asset.shareToken == address(0)) {
            revert ZeroAddress();
        }
        if (assetIdOf[asset.shareToken] != 0) revert TokenAlreadyRegistered(asset.shareToken);
        assetId = ++totalAssets;
        _assets[assetId] = AssetRecord({
            assetClass: asset.assetClass,
            status: AssetStatus.Active,
            createdAt: uint64(block.timestamp),
            shareToken: asset.shareToken,
            documentHash: asset.documentHash,
            name: asset.name,
            jurisdiction: asset.jurisdiction,
            metadataURI: asset.metadataURI
        });
        assetIdOf[asset.shareToken] = assetId;
        _mint(custodian, assetId);
        emit AssetRegistered(assetId, asset.shareToken, custodian, asset.assetClass);
    }

    function setStatus(uint256 assetId, AssetStatus status) external onlyRole(RECORDS_ROLE) {
        _record(assetId).status = status;
        emit AssetStatusChanged(assetId, status);
    }

    function updateDocuments(uint256 assetId, string calldata metadataURI, bytes32 documentHash)
        external
        onlyRole(RECORDS_ROLE)
    {
        AssetRecord storage record = _record(assetId);
        record.metadataURI = metadataURI;
        record.documentHash = documentHash;
        emit AssetDocumentsUpdated(assetId, metadataURI, documentHash);
    }

    function transferCustody(uint256 assetId, address newCustodian) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newCustodian == address(0)) revert ZeroAddress();
        address previous = _requireOwned(assetId);
        _custodyChange = true;
        _transfer(previous, newCustodian, assetId);
        _custodyChange = false;
        emit CustodyTransferred(assetId, previous, newCustodian);
    }

    function assetOf(uint256 assetId) external view returns (AssetRecord memory) {
        _requireOwned(assetId);
        return _assets[assetId];
    }

    function isActiveToken(address shareToken) external view returns (bool) {
        uint256 assetId = assetIdOf[shareToken];
        // slither-disable-next-line incorrect-equality,timestamp (enum comparison)
        return assetId != 0 && _assets[assetId].status == AssetStatus.Active;
    }

    function tokenURI(uint256 assetId) public view override returns (string memory) {
        _requireOwned(assetId);
        return _assets[assetId].metadataURI;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && !_custodyChange) revert DeedTransferRestricted();
        return super._update(to, tokenId, auth);
    }

    function _record(uint256 assetId) private view returns (AssetRecord storage record) {
        record = _assets[assetId];
        if (record.shareToken == address(0)) revert UnknownAsset(assetId);
    }
}
