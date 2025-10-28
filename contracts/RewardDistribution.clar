(define-constant ERR-NOT-AUTHORIZED u300)
(define-constant ERR-WALLET-NOT-FOUND u301)
(define-constant ERR-POOL-NOT-FOUND u302)
(define-constant ERR-NO-CONTRIBUTION u303)
(define-constant ERR-INVALID-REWARD-RATE u304)
(define-constant ERR-INSUFFICIENT-BALANCE u305)
(define-constant ERR-INVALID-POOL-ID u306)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u307)
(define-constant ERR-INVALID-DATA-INDEX u308)
(define-constant ERR-REWARD-ALREADY-CLAIMED u309)
(define-constant ERR-INVALID-AMOUNT u310)
(define-constant ERR-INVALID-TIMESTAMP u311)
(define-constant ERR-TOKEN-CONTRACT-NOT-SET u312)

(define-data-var authority-contract (optional principal) none)
(define-data-var wallet-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var anon-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var token-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var reward-rate uint u10)
(define-data-var total-rewards uint u0)

(define-map reward-claims
  { user: principal, pool-id: uint, entry-index: uint }
  { amount: uint, timestamp: uint }
)

(define-read-only (get-reward-claim (user principal) (pool-id uint) (entry-index uint))
  (map-get? reward-claims { user: user, pool-id: pool-id, entry-index: entry-index })
)

(define-read-only (get-total-rewards)
  (ok (var-get total-rewards))
)

(define-private (validate-pool-id (pool-id uint))
  (contract-call? .AnonymizationContract get-pool pool-id)
)

(define-private (validate-amount (amount uint))
  (if (> amount u0)
      (ok true)
      (err ERR-INVALID-AMOUNT))
)

(define-private (validate-reward-rate (rate uint))
  (if (and (> rate u0) (<= rate u100))
      (ok true)
      (err ERR-INVALID-REWARD-RATE))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (asserts! (not (is-eq contract-principal 'SP000000000000000000002Q6VF78)) (err ERR-NOT-AUTHORIZED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-token-contract (contract-principal principal))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (asserts! (not (is-eq contract-principal 'SP000000000000000000002Q6VF78)) (err ERR-NOT-AUTHORIZED))
    (var-set token-contract contract-principal)
    (ok true)
  )
)

(define-public (set-reward-rate (new-rate uint))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (try! (validate-reward-rate new-rate))
    (var-set reward-rate new-rate)
    (ok true)
  )
)

(define-public (claim-reward (pool-id uint) (entry-index uint))
  (let ((user tx-sender)
        (wallet (unwrap! (contract-call? .UserWalletContract get-wallet-details user) (err ERR-WALLET-NOT-FOUND)))
        (pool (unwrap! (contract-call? .AnonymizationContract get-pool pool-id) (err ERR-POOL-NOT-FOUND)))
        (anon-entry (unwrap! (contract-call? .AnonymizationContract get-anon-entry user pool-id entry-index) (err ERR-NO-CONTRIBUTION)))
        (reward-key { user: user, pool-id: pool-id, entry-index: entry-index })
        (reward-amount (/ (* (get aggregate-value anon-entry) (var-get reward-rate)) u100)))
    (asserts! (is-none (map-get? reward-claims reward-key)) (err ERR-REWARD-ALREADY-CLAIMED))
    (try! (validate-amount reward-amount))
    (try! (contract-call? .TokenContract transfer reward-amount .RewardDistributionContract user))
    (map-set reward-claims reward-key
      { amount: reward-amount, timestamp: block-height }
    )
    (var-set total-rewards (+ (var-get total-rewards) reward-amount))
    (print { event: "reward-claimed", user: user, pool-id: pool-id, entry-index: entry-index, amount: reward-amount })
    (ok reward-amount)
  )
)

(define-public (fund-reward-pool (amount uint))
  (let ((user tx-sender))
    (asserts! (is-some (var-get token-contract)) (err ERR-TOKEN-CONTRACT-NOT-SET))
    (try! (validate-amount amount))
    (try! (contract-call? .TokenContract transfer amount user .RewardDistributionContract))
    (print { event: "pool-funded", amount: amount, user: user })
    (ok true)
  )
)

(define-public (get-reward-rate)
  (ok (var-get reward-rate))
)