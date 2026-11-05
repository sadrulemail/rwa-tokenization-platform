# Security notes

## Controls in place

**Contracts**

* Every mint and transfer checks: not paused, sender and receiver not frozen, both verified and unexpired,
  shares not locked, then the asset's compliance rules. A transfer that fails reverts with a reason code.
* Role separation with OpenZeppelin `AccessControl`. The admin role is meant for a Safe multisig; the
  deploy script hands it over and renounces the deployer's roles.
* Maker-checker on the issuance desk: the requester can never approve their own request.
* Investor slippage limits (`minShares`, `minPayout`) protect against NAV changes between request and
  approval.
* Reentrancy guards (transient storage) on every function that moves stablecoin; checks-effects-interactions
  ordering; `SafeERC20`.
* No upgradeable proxies: asset tokens are immutable clones; implementations call `_disableInitializers`.
* Income cannot be over-claimed: rounding always favours the contract. This is covered by fuzz and invariant
  tests.
* Slither runs clean. The detectors that are suppressed each have an inline reason (treasury-funded
  redemptions, exact-balance checks).

**API**

* Wallet sign-in (EIP-4361) with single-use nonces bound to domain and chain; short-lived JWTs.
* Global JWT guard plus role guard; DTO validation with whitelisting; Helmet; CORS limited to the web origin;
  rate limits on sign-in.
* Personal data is encrypted with AES-256-GCM, using a fresh IV per field; duplicate documents are detected
  with a keyed HMAC, never the clear value; list views mask e-mail and document numbers.
* Audit log is hash-chained and append-only at the database level; on-chain actions are recorded only after
  the receipt is checked.
* Production refuses to start without explicit secrets, and never uses the local development registrar key on
  a public chain.

## Known limitations

* **No external audit.** Commission one before any mainnet deployment.
* **Simulated KYC screening.** `ScreeningService` is deterministic and uses a fictional watch list. Swap it
  for a regulated provider.
* **Registrar hot key.** The API signs registry updates with a key that only holds `REGISTRAR_ROLE`. In
  production keep it in a KMS/HSM and rate-limit it; a compromised registrar can whitelist wallets but cannot
  mint or move shares.
* **Treasury allowance.** Redemptions draw from the treasury through an allowance to the desk. Keep that
  allowance sized to the expected redemption volume.
* **Valuations are trusted inputs.** NAV comes from the valuer role with a report hash; there is no on-chain
  oracle or deviation limit.
* **Recovery and pending requests.** Reject a wallet's pending desk requests before recovering it; locks move
  to the new wallet but request records keep the old address.
* **Local development accounts.** The local wallets in the web app use Anvil's public keys and are enabled
  only on chain 31337.
