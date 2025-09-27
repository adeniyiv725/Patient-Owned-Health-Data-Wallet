(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-DATA-HASH u101)
(define-constant ERR-INVALID-SOURCE u102)
(define-constant ERR-INVALID-DATA-TYPE u103)
(define-constant ERR-INVALID-DESCRIPTION u104)
(define-constant ERR-MAX-ENTRIES-EXCEEDED u105)
(define-constant ERR-ENTRY-NOT-FOUND u106)
(define-constant ERR-INVALID-INDEX u107)
(define-constant ERR-INVALID-ENCRYPTION-KEY u108)
(define-constant ERR-WALLET-NOT-FOUND u109)
(define-constant ERR-INVALID-CONSENT u110)
(define-constant ERR-INVALID-TIMESTAMP u111)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u112)
(define-constant ERR-INVALID-MAX-ENTRIES u113)
(define-constant ERR-INVALID-UPDATE-PARAM u114)
(define-constant ERR-ACCESS-ALREADY-LOGGED u115)
(define-constant ERR-INVALID-ACCESSOR u116)
(define-constant ERR-INVALID-STATUS u117)
(define-constant ERR-INVALID-CATEGORY u118)
(define-constant ERR-INVALID-VALUE-RANGE u119)
(define-constant ERR-INVALID-ACCESS-LEVEL u120)

(define-data-var next-wallet-id uint u0)
(define-data-var max-wallets uint u10000)
(define-data-var max-entries-per-wallet uint u500)
(define-data-var authority-contract (optional principal) none)

(define-map user-wallets
  principal
  {
    id: uint,
    creation-timestamp: uint,
    entry-count: uint,
    status: bool,
    total-data-size: uint
  }
)

(define-map data-entries
  { user: principal, index: uint }
  {
    data-hash: (buff 32),
    timestamp: uint,
    source: (string-ascii 50),
    data-type: (string-ascii 20),
    description: (string-utf8 200),
    consent: bool,
    encryption-key: (optional (buff 64)),
    category: (string-ascii 30),
    value-range-min: uint,
    value-range-max: uint,
    access-level: uint
  }
)

(define-map access-logs
  { user: principal, entry-index: uint, accessor: principal }
  {
    access-timestamp: uint,
    purpose: (string-utf8 100),
    granted: bool
  }
)

(define-read-only (get-wallet-details (user principal))
  (map-get? user-wallets user)
)

(define-read-only (get-data-entry (user principal) (index uint))
  (map-get? data-entries { user: user, index: index })
)

(define-read-only (get-access-log (user principal) (entry-index uint) (accessor principal))
  (map-get? access-logs { user: user, entry-index: entry-index, accessor: accessor })
)

(define-private (validate-data-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
      (ok true)
      (err ERR-INVALID-DATA-HASH))
)

(define-private (validate-source (source (string-ascii 50)))
  (if (and (> (len source) u0) (<= (len source) u50))
      (ok true)
      (err ERR-INVALID-SOURCE))
)

(define-private (validate-data-type (dtype (string-ascii 20)))
  (if (or (is-eq dtype "fitness") (is-eq dtype "vitals") (is-eq dtype "sleep"))
      (ok true)
      (err ERR-INVALID-DATA-TYPE))
)

(define-private (validate-description (desc (string-utf8 200)))
  (if (<= (len desc) u200)
      (ok true)
      (err ERR-INVALID-DESCRIPTION))
)

(define-private (validate-encryption-key (key (optional (buff 64))))
  (match key k
    (if (is-eq (len k) u64) (ok true) (err ERR-INVALID-ENCRYPTION-KEY))
    (ok true))
)

(define-private (validate-category (cat (string-ascii 30)))
  (if (<= (len cat) u30)
      (ok true)
      (err ERR-INVALID-CATEGORY))
)

(define-private (validate-value-range (min uint) (max uint))
  (if (<= min max)
      (ok true)
      (err ERR-INVALID-VALUE-RANGE))
)

(define-private (validate-access-level (level uint))
  (if (<= level u3)
      (ok true)
      (err ERR-INVALID-ACCESS-LEVEL))
)

(define-private (validate-index (index uint) (count uint))
  (if (< index count)
      (ok true)
      (err ERR-INVALID-INDEX))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-NOT-AUTHORIZED))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-entries-per-wallet (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-MAX-ENTRIES))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-entries-per-wallet new-max)
    (ok true)
  )
)

(define-public (initialize-wallet)
  (let ((user tx-sender)
        (next-id (var-get next-wallet-id)))
    (asserts! (is-none (map-get? user-wallets user)) (err ERR-NOT-AUTHORIZED))
    (map-set user-wallets user
      {
        id: next-id,
        creation-timestamp: block-height,
        entry-count: u0,
        status: true,
        total-data-size: u0
      }
    )
    (var-set next-wallet-id (+ next-id u1))
    (print { event: "wallet-initialized", user: user, id: next-id })
    (ok next-id)
  )
)

(define-public (register-data
  (data-hash (buff 32))
  (source (string-ascii 50))
  (data-type (string-ascii 20))
  (description (string-utf8 200))
  (encryption-key (optional (buff 64)))
  (category (string-ascii 30))
  (value-range-min uint)
  (value-range-max uint)
  (access-level uint)
)
  (let ((user tx-sender)
        (wallet (unwrap! (map-get? user-wallets user) (err ERR-WALLET-NOT-FOUND)))
        (current-count (get entry-count wallet))
        (max-entries (var-get max-entries-per-wallet)))
    (asserts! (< current-count max-entries) (err ERR-MAX-ENTRIES-EXCEEDED))
    (try! (validate-data-hash data-hash))
    (try! (validate-source source))
    (try! (validate-data-type data-type))
    (try! (validate-description description))
    (try! (validate-encryption-key encryption-key))
    (try! (validate-category category))
    (try! (validate-value-range value-range-min value-range-max))
    (try! (validate-access-level access-level))
    (map-set data-entries { user: user, index: current-count }
      {
        data-hash: data-hash,
        timestamp: block-height,
        source: source,
        data-type: data-type,
        description: description,
        consent: false,
        encryption-key: encryption-key,
        category: category,
        value-range-min: value-range-min,
        value-range-max: value-range-max,
        access-level: access-level
      }
    )
    (map-set user-wallets user
      (merge wallet { entry-count: (+ current-count u1), total-data-size: (+ (get total-data-size wallet) u1) })
    )
    (print { event: "data-registered", user: user, index: current-count })
    (ok current-count)
  )
)

(define-public (update-consent (index uint) (consent bool))
  (let ((user tx-sender)
        (wallet (unwrap! (map-get? user-wallets user) (err ERR-WALLET-NOT-FOUND)))
        (entry (unwrap! (map-get? data-entries { user: user, index: index }) (err ERR-ENTRY-NOT-FOUND))))
    (try! (validate-index index (get entry-count wallet)))
    (map-set data-entries { user: user, index: index }
      (merge entry { consent: consent })
    )
    (print { event: "consent-updated", user: user, index: index, consent: consent })
    (ok true)
  )
)

(define-public (log-access (entry-index uint) (accessor principal) (purpose (string-utf8 100)) (granted bool))
  (let ((user tx-sender)
        (wallet (unwrap! (map-get? user-wallets user) (err ERR-WALLET-NOT-FOUND)))
        (entry (unwrap! (map-get? data-entries { user: user, index: entry-index }) (err ERR-ENTRY-NOT-FOUND))))
    (try! (validate-index entry-index (get entry-count wallet)))
    (asserts! (is-none (map-get? access-logs { user: user, entry-index: entry-index, accessor: accessor })) (err ERR-ACCESS-ALREADY-LOGGED))
    (map-set access-logs { user: user, entry-index: entry-index, accessor: accessor }
      {
        access-timestamp: block-height,
        purpose: purpose,
        granted: granted
      }
    )
    (print { event: "access-logged", user: user, entry-index: entry-index, accessor: accessor })
    (ok true)
  )
)

(define-public (delete-entry (index uint))
  (let ((user tx-sender)
        (wallet (unwrap! (map-get? user-wallets user) (err ERR-WALLET-NOT-FOUND)))
        (entry-count (get entry-count wallet)))
    (try! (validate-index index entry-count))
    (map-delete data-entries { user: user, index: index })
    (map-set user-wallets user
      (merge wallet { entry-count: (- entry-count u1), total-data-size: (- (get total-data-size wallet) u1) })
    )
    (print { event: "entry-deleted", user: user, index: index })
    (ok true)
  )
)

(define-public (get-entry-count (user principal))
  (match (map-get? user-wallets user)
    wallet (ok (get entry-count wallet))
    (err ERR-WALLET-NOT-FOUND)
  )
)

(define-public (is-entry-consented (user principal) (index uint))
  (match (map-get? data-entries { user: user, index: index })
    entry (ok (get consent entry))
    (err ERR-ENTRY-NOT-FOUND)
  )
)