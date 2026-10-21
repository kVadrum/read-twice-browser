// Curated v0.1 detection data. INTERIM home — per architecture §3 / ADR-004 this
// data moves to the companion repo's lists/*.yaml and compiles in at build time.
//
// For RED rules the accuracy of these lists IS the precision (ADR-005 red criteria
// #1 impersonation-of-canonical and #3 no-legitimate-use phrases): the canonical
// allow-lists are the high-leverage mitigation against the existential red-FP. Lists
// are deliberately conservative; corpus calibration (heuristic-ruleset §4) tunes them.

/** `tld-elevated-risk`: abuse-heavy TLDs. Modifier only — never a standalone banner. */
export const ELEVATED_TLDS: readonly string[] = [
  'zip', 'top', 'xyz', 'click', 'support', 'link', 'country', 'work', 'gq', 'tk',
];

export interface BrandImpersonation {
  /** Lowercase token matched against host labels (hyphen/dot-bounded, not substring). */
  keyword: string;
  /** Name shown to the user. */
  display: string;
  /** The brand's real domain(s). A host on any of these is legitimate, not impersonation.
   *  The first is the one the banner sends the user to ("The real {brand} website is …"). */
  canonical: readonly string[];
}

/** `tld-impersonation`: a brand token in the host while NOT on the brand's real domain.
 *  Every domain another list here calls a brand's own (its phone-rule sites, its mail
 *  senders) must be on its canonical list too, or the brand's own site reads as an impostor
 *  — a test pins it. Ownership of each added domain was checked 2026-10-21 (RDAP registrant,
 *  the brand's own nameservers, or the brand's own pages linking it). */
export const BRAND_IMPERSONATION: readonly BrandImpersonation[] = [
  { keyword: 'irs', display: 'IRS', canonical: ['irs.gov'] },
  // usps.gov: RDAP registrant United States Postal Service; it redirects to usps.com.
  { keyword: 'usps', display: 'USPS', canonical: ['usps.com', 'usps.gov'] },
  { keyword: 'ssa', display: 'Social Security', canonical: ['ssa.gov'] },
  { keyword: 'medicare', display: 'Medicare', canonical: ['medicare.gov'] },
  { keyword: 'chase', display: 'Chase', canonical: ['chase.com'] },
  { keyword: 'wellsfargo', display: 'Wells Fargo', canonical: ['wellsfargo.com'] },
  { keyword: 'bankofamerica', display: 'Bank of America', canonical: ['bankofamerica.com'] },
  {
    // PayPal.Me and PayPal's mail domains (BRAND_SENDERS). Each is served by PayPal's own
    // nameservers (SOA hostmaster.paypal.com), except paypal.hk and paypal-customerfeedback.com
    // (MarkMonitor-parked, DMARC reports to PayPal's Agari mailbox) and paypal-prepaid.com
    // (redirects into paypal.com). Today the country domains and paypal.me redirect into
    // paypal.com too, and the survey domains serve no www site.
    keyword: 'paypal',
    display: 'PayPal',
    canonical: [
      'paypal.com', 'paypal.me', 'paypal.co.uk', 'paypal.ca', 'paypal.com.au', 'paypal.de',
      'paypal.fr', 'paypal.es', 'paypal.it', 'paypal.nl', 'paypal.be', 'paypal.at', 'paypal.ch',
      'paypal.dk', 'paypal.se', 'paypal.pl', 'paypal.com.mx', 'paypal.com.sg', 'paypal.hk',
      'paypal.co.il', 'paypal-experience.com', 'paypal-customerfeedback.com',
      'paypal-brandsfeedback.com', 'paypal-creditsurvey.com', 'paypal-prepaid.com',
    ],
  },
  { keyword: 'venmo', display: 'Venmo', canonical: ['venmo.com'] },
  { keyword: 'cashapp', display: 'Cash App', canonical: ['cash.app'] },
  // zellepay.com now redirects to www.zelle.com, so zelle.com is the site users land on — and
  // the one to send them to.
  { keyword: 'zelle', display: 'Zelle', canonical: ['zelle.com', 'zellepay.com'] },
  { keyword: 'fedex', display: 'FedEx', canonical: ['fedex.com'] },
  { keyword: 'ups', display: 'UPS', canonical: ['ups.com'] },
  { keyword: 'dhl', display: 'DHL', canonical: ['dhl.com'] },
  // `.microsoft` is Microsoft's closed brand TLD — outlook.cloud.microsoft is real Outlook.
  { keyword: 'microsoft', display: 'Microsoft', canonical: ['microsoft.com', 'microsoft'] },
  { keyword: 'apple', display: 'Apple', canonical: ['apple.com'] },
  {
    // Amazon's storefronts and its seller sites around the world, as Amazon's own
    // sell.amazon.com/global-selling lists them; amazon.lu (redirects through Amazon's own
    // site-redirect to amazon.de); amazon.jobs and amazon.science, linked from aboutamazon.com.
    // Never amazonaws.com or awsapps.com: anyone can get a subdomain there, and the "amazon"
    // token doesn't match them anyway.
    keyword: 'amazon',
    display: 'Amazon',
    canonical: [
      'amazon.com', 'amazon.ca', 'amazon.com.mx', 'amazon.com.br', 'amazon.co.uk', 'amazon.de',
      'amazon.es', 'amazon.fr', 'amazon.it', 'amazon.nl', 'amazon.pl', 'amazon.se', 'amazon.ie',
      'amazon.com.be', 'amazon.lu', 'amazon.com.tr', 'amazon.co.jp', 'amazon.in', 'amazon.com.au',
      'amazon.sg', 'amazon.com.sg', 'amazon.cn', 'amazon.co.kr', 'amazon.com.tw', 'amazon.co.th',
      'amazon.vn', 'amazon.ae', 'amazon.sa', 'amazon.eg', 'amazon.co.za', 'amazon.jobs',
      'amazon.science',
    ],
  },
];

/** `scam-language-urgent` (yellow): exact phrases, not bare keywords (heuristic-ruleset §3.3). */
export const URGENCY_PHRASES: readonly string[] = [
  'account will be suspended',
  'act now or lose',
  'your computer is infected',
  'your account has been compromised',
  'verify your identity within',
  'you are required to call',
  'your subscription will be automatically renewed unless',
  'suspended within 24 hours',
  'immediate action is required',
  'final notice',
];

/** `scam-language-pressure` (red): phrases with essentially no legitimate use in context.
 *  Kept to specific multi-word forms ("gift cards only", not bare "gift cards") to hold
 *  the red-FP rate down. Compound co-occurrence checks (bitcoin+verify, wire+today) are a
 *  slice-2 refinement. */
export const PRESSURE_PHRASES: readonly string[] = [
  'gift cards only',
  'pay with gift cards',
  'do not tell anyone',
  'do not hang up',
  "don't hang up",
  'we will send a courier',
  'your social security number has been suspended',
  'social security number has been suspended',
];

// ── Sender paths ────────────────────────────────────────────────────────────
// Each allow-list below is two lists (origin.ts contentIsFrom): the entity's websites, matched
// against the page host, and its mail senders, matched against an email's From in webmail
// mode. A From header is the sender's own claim, so a sender entry counts only where the
// domain's DMARC policy enforces (p=reject or p=quarantine, pct 100) at the level the entry
// matches: a bare domain also covers its subdomains, so its policy must too (no sp=none); an
// "@domain" entry is that exact domain alone. A host is never a sender by default — each
// sender entry carries its basis, measured with `dig +short TXT _dmarc.<domain>` on
// 2026-10-21. Re-measure before adding one: a p=none domain is spoofable by anyone.

/** Hosts on a listed entity's own domains that serve pages anyone can write — a host there
 *  proves who runs the server, not who wrote the page, so it never exempts a rule (origin.ts
 *  contentIsFrom), and no hit there is red (engine.ts capsAtYellow): organisations publish
 *  their own IT notices there too. Sway, Forms and Loop pages sit on Microsoft's closed
 *  `.microsoft` TLD, and their older office.com / microsoft.com hosts redirect there (curl,
 *  2026-10-21); phishing on sway.cloud.microsoft is documented (Netskope, 2024). */
export const USER_CONTENT_HOSTS: readonly string[] = [
  'sway.cloud.microsoft', 'forms.cloud.microsoft', 'loop.cloud.microsoft',
  'sway.office.com', 'forms.office.com', 'sway.microsoft.com',
];

/** News coverage of scams legitimately quotes pressure phrases — suppress red there. */
export const NEWS_DOMAINS_ALLOW: readonly string[] = [
  'nytimes.com', 'washingtonpost.com', 'apnews.com', 'reuters.com', 'bbc.com', 'bbc.co.uk',
  'wsj.com', 'npr.org', 'theguardian.com', 'cnn.com', 'forbes.com', 'bloomberg.com',
  'krebsonsecurity.com', 'aarp.org', 'ftc.gov',
];

/** NEWS_DOMAINS_ALLOW's sender path: the publishers' newsletters. Not krebsonsecurity.com,
 *  which publishes no DMARC record — anyone can send as it. */
export const NEWS_SENDERS_ALLOW: readonly string[] = [
  // p=reject, no sp (subdomains inherit reject).
  'nytimes.com', 'washingtonpost.com', 'apnews.com', 'reuters.com', 'bbc.com', 'bbc.co.uk',
  'npr.org', 'theguardian.com', 'cnn.com', 'forbes.com', 'bloomberg.com',
  'wsj.com', // p=quarantine, no sp
  'ftc.gov', // p=reject sp=reject
  // aarp.org is p=reject but sp=none, so its subdomains are spoofable: the apex alone, plus
  // email.aarp.org, which publishes its own p=reject (not its subdomains, which fall back to sp=none).
  '@aarp.org', '@email.aarp.org',
];

export interface AgencyImpersonation {
  /** Agency names/acronyms, matched as whole words/phrases in page text. */
  keywords: readonly string[];
  display: string;
  /** The agency's real website domain(s) — the host path. */
  canonical: readonly string[];
  /** The agency's mail senders whose DMARC enforces (see Sender paths) — the sender path. */
  senders: readonly string[];
}

/** `government-impersonation`: agency named in page text + a payment ask, off the real domain. */
export const GOVERNMENT_AGENCIES: readonly AgencyImpersonation[] = [
  // irs.gov p=reject (no sp); ssa.gov p=reject sp=reject; usps.com p=reject; medicare.gov p=reject.
  { keywords: ['IRS', 'Internal Revenue Service'], display: 'IRS', canonical: ['irs.gov'], senders: ['irs.gov'] },
  { keywords: ['SSA', 'Social Security Administration'], display: 'Social Security', canonical: ['ssa.gov'], senders: ['ssa.gov'] },
  // usps.gov and the Postal Inspection Service's uspis.gov: RDAP registrant United States Postal
  // Service, both USPS's own on the phone list too. Hosts only — not measured as senders.
  { keywords: ['USPS', 'United States Postal Service'], display: 'USPS', canonical: ['usps.com', 'usps.gov', 'uspis.gov'], senders: ['usps.com'] },
  { keywords: ['Medicare'], display: 'Medicare', canonical: ['medicare.gov'], senders: ['medicare.gov'] },
  // canada.ca is the CRA's website but p=none — a host, never a sender. CRA mail is
  // cra-arc.gc.ca: p=reject sp=reject.
  { keywords: ['CRA', 'Canada Revenue Agency'], display: 'CRA', canonical: ['canada.ca', 'cra-arc.gc.ca'], senders: ['cra-arc.gc.ca'] },
  // HMRC's website is www.gov.uk; gov.uk is p=reject but sp=none, so as a sender only HMRC's own
  // hmrc.gov.uk: p=reject, and its own organizational domain (gov.uk is a public suffix), so its
  // subdomains inherit reject.
  {
    keywords: ['HMRC', "His Majesty's Revenue and Customs", "Her Majesty's Revenue and Customs"],
    display: 'HMRC',
    canonical: ['gov.uk'],
    senders: ['hmrc.gov.uk'],
  },
];

/** Companies that legitimately work with agency data — never government impersonation. */
export const TAX_PREP_ALLOW: readonly string[] = [
  'turbotax.com', 'intuit.com', 'hrblock.com', 'freetaxusa.com', 'taxact.com', 'creditkarma.com',
];

/** TAX_PREP_ALLOW's sender path. All p=reject, no sp=none (freetaxusa.com sp=reject). */
export const TAX_PREP_SENDERS: readonly string[] = [
  'turbotax.com', 'intuit.com', 'hrblock.com', 'freetaxusa.com', 'taxact.com', 'creditkarma.com',
];

/** Specific payment-collection CTAs (not bare "pay") for the government-impersonation element. */
export const PAY_CTA_PHRASES: readonly string[] = [
  'click here to pay', 'pay now', 'make a payment', 'submit payment', 'pay your balance', 'pay the fee',
];

export interface SupportBrand {
  /** Specific support phrasings ("Microsoft Support"), not the bare brand name. */
  keywords: readonly string[];
  display: string;
  /** The brand's real website domain(s) — the host path. */
  canonical: readonly string[];
  /** The brand's mail senders whose DMARC enforces (see Sender paths) — the sender path. */
  senders: readonly string[];
}

/** `tech-support-impersonation`: a fake support page (brand-support claim near the top + a number to call). */
export const TECH_SUPPORT_BRANDS: readonly SupportBrand[] = [
  // microsoft.com p=reject; apple.com p=quarantine sp=reject; norton.com p=quarantine;
  // mcafee.com p=reject sp=reject; bestbuy.com and geeksquad.com p=reject. `.microsoft` is
  // Microsoft's closed brand TLD, as in BRAND_IMPERSONATION: a host, so outlook.cloud.microsoft
  // (a mail client) never exempts the email open in it (origin.ts contentIsFrom).
  { keywords: ['Microsoft Support', 'Microsoft Customer Service', 'Windows Support'], display: 'Microsoft', canonical: ['microsoft.com', 'microsoft'], senders: ['microsoft.com'] },
  { keywords: ['Apple Support', 'AppleCare', 'Apple Care'], display: 'Apple', canonical: ['apple.com'], senders: ['apple.com'] },
  { keywords: ['Norton Support', 'Norton Customer Service'], display: 'Norton', canonical: ['norton.com'], senders: ['norton.com'] },
  { keywords: ['McAfee Support'], display: 'McAfee', canonical: ['mcafee.com'], senders: ['mcafee.com'] },
  { keywords: ['Geek Squad'], display: 'Geek Squad', canonical: ['bestbuy.com', 'geeksquad.com'], senders: ['bestbuy.com', 'geeksquad.com'] },
];

/** `payment-form-anomaly`: a payment form posting cross-domain to a NON-processor is the
 *  anomaly. These are the expected, legitimate processor destinations. */
export const PAYMENT_PROCESSORS_ALLOW: readonly string[] = [
  'stripe.com', 'braintreegateway.com', 'braintree-api.com', 'paypal.com', 'paypalobjects.com',
  'adyen.com', 'squareup.com', 'square.com', 'checkout.com', 'authorize.net', 'worldpay.com',
  '2checkout.com', 'klarna.com', 'affirm.com', 'razorpay.com', 'paddle.com', 'amazonpay.com',
  'shopify.com', 'shopifycs.com',
];

// ── redirect-chain-long ─────────────────────────────────────────────────────
// Interim home of the companion repo's lists/url-shorteners.yaml (heuristic-ruleset §6.1).

/** `redirect-chain-long` (modifier): redirectors whose main use is hiding where a link
 *  goes or counting its clicks. Matched with isOnDomain, so subdomains count.
 *
 *  Deliberately NOT listed, though they redirect:
 *  - Protective rewriters that mail and chat security routes legitimate links through —
 *    Microsoft Safe Links (safelinks.protection.outlook.com), Proofpoint (urldefense.com,
 *    urldefense.proofpoint.com), Mimecast (mimecast.com, mimecastprotect.com), Barracuda
 *    (cudasvc.com), Facebook's link shim (l.facebook.com), and Google's redirector
 *    (google.com/url — a path, so listing it would mean listing all of google.com).
 *    Those hops exist to check the link for the user; naming one as "including
 *    {shortener}" would present a protective hop as suspicious.
 *  - Single-destination brand shorteners (youtu.be, amzn.to, maps.app.goo.gl): they only
 *    ever resolve to their own platform, so they hide nothing. goo.gl stays out with them —
 *    retired for new links, and listing it would also catch maps.app.goo.gl.
 *
 *  Click trackers that run on the sender's own domain (most branded email tracking) are
 *  invisible to a host list; only the shared tracker hosts below can be listed. */
export const URL_SHORTENERS: readonly string[] = [
  // Public shorteners — anyone can mint a link that lands anywhere.
  'bit.ly', 'bit.do', 'tinyurl.com', 'tiny.cc', 'is.gd', 'v.gd', 'ow.ly', 'buff.ly',
  'rebrand.ly', 'cutt.ly', 'shorturl.at', 'rb.gy', 't.ly', 's.id', 'short.gy', 'clck.ru',
  // Platform link wrappers that shorten every outbound link posted there.
  't.co', 'lnkd.in',
  // Dynamic-QR redirector: the printed code never shows the destination (quishing).
  'qrco.de',
  // Shared email click trackers (Mailchimp, SendGrid, Mandrill, Constant Contact).
  'list-manage.com', 'ct.sendgrid.net', 'mandrillapp.com', 'rs6.net',
  // Ad-interstitial shorteners and referrer-stripping anonymizers.
  'adf.ly', 'ouo.io', 'anonym.to', 'nullrefer.com',
];

// ─── phone-number-impersonation: canonical published phone numbers ────────────
// Interim home of the companion repo's lists/canonical-phones.yaml (heuristic-ruleset
// §3.2, §6.1). This list IS the rule's precision: a real line missing from it reads as a
// "fake" number, i.e. a red FP. So every number here was found on the brand's own domain
// by a curator AND re-confirmed there by an independent verifier (2026-10); single-sourced
// candidates are deliberately left out. Comments carry each number's source page so a
// maintainer can re-verify — support lines drift (ADR-005, canonical-phone allow-list cost).

export interface CanonicalPhoneBrand {
  /** Name shown to the user as {brand}. */
  display: string;
  /** Brand names, matched as whole words in page text. */
  keywords: readonly string[];
  /** The name is also an everyday word or first name ("Apple", "Chase", "UPS"): match its
   *  keywords case-sensitively, and never accept a bare single-word name after "call" /
   *  "contact" — "Call Chase at …" is as likely a person as the bank. */
  commonWord?: boolean;
  /** The brand's real domain(s). A page on one of these is the brand talking about itself. */
  canonical: readonly string[];
  /** The main support number, in the brand's own printed form — shown to users as {canonical}. */
  primary: string;
  /** Every verified official US/CA number, as 10 NANP digits (no country code). */
  numbers: readonly string[];
}

export const CANONICAL_PHONES: readonly CanonicalPhoneBrand[] = [
  {
    display: 'Microsoft',
    keywords: ['Microsoft', 'Microsoft Support', 'Microsoft Customer Support', 'Windows Support', 'Microsoft 365', 'Office 365'],
    // Web domains only: live.com and outlook.com are free webmail, and the Outlook clients sit
    // on live.com, office.com and `.microsoft` (Microsoft's closed brand TLD, as in
    // BRAND_IMPERSONATION) — so in webmail mode these never exempt an email (origin.ts).
    canonical: ['microsoft.com', 'live.com', 'outlook.com', 'office.com', 'windows.com', 'microsoft365.com', 'xbox.com', 'microsoft'],
    primary: '800 642 7676',
    numbers: [
      // https://support.microsoft.com/en-us/support/ (US row of the support-numbers table)
      '8006427676', // customer service, toll-free (1-800-MICROSOFT)
      '8552700615', // customer service, toll-free
      '8008659408', // customer service, toll-free
      '3054189136', // customer service, toll line
    ],
  },
  {
    display: 'Apple',
    keywords: ['Apple', 'Apple Support', 'AppleCare', 'Apple ID', 'Apple Account', 'iCloud'],
    commonWord: true,
    canonical: ['apple.com', 'icloud.com'],
    primary: '800-275-2273',
    numbers: [
      // https://www.apple.com/legal/sales-support/applecare/applecareplus/2610/261013_applecareplus_us.pdf
      // (also listed under United States on https://support.apple.com/en-us/106932)
      '8002752273', // Apple Support / AppleCare (800-APL-CARE)
      // https://support.apple.com/en-us/106932
      '8002633394', // Apple Support, Canada
      '8008002775', // education customers
      '8669027144', // Apple Business / Apple School Manager
      '8772338552', // Apple Cash and person-to-person payments
      // https://www.apple.com/contact/
      '8006927753', // Online Store sales + order status (1-800-MY-APPLE)
      '8005389696', // reseller referral
    ],
  },
  {
    display: 'IRS',
    keywords: ['IRS', 'Internal Revenue Service', 'I.R.S.', 'Taxpayer Advocate Service'],
    canonical: ['irs.gov'],
    primary: '800-829-1040',
    numbers: [
      // https://www.irs.gov/help/let-us-help-you
      '8008291040', // individuals (also the Spanish-language line)
      '8008294933', // businesses / specialty taxes
      '8778295500', // non-profit (tax-exempt)
      '8666994083', // estate and gift taxes
      '8666994096', // excise taxes
      '8335539895', // interpretation (languages other than Spanish)
      '8445455640', // Taxpayer Assistance Center appointments
      // https://www.irs.gov/refunds
      '8008291954', // automated refund status
      '8664642050', // amended return status
      // https://www.irs.gov/identity-theft-central/identity-theft-guide-for-individuals
      '8009084490', // identity and tax-return verification
      '8009089946', // return copies / transcripts
      // https://www.irs.gov/tax-professionals/practitioner-priority-service-r
      '8668604259', // Practitioner Priority Service
      '8662550654', // e-Services help desk
      '8008298310', // notice line (printed on some notices)
      '8775714712', // notice line (printed on some notices)
      '8668970161', // SB/SE examination (printed on exam letters)
      '8668970177', // Wage and Investment examination (printed on exam letters)
      // https://www.taxpayeradvocate.irs.gov/contact-us/
      '8777774778', // Taxpayer Advocate Service
    ],
  },
  {
    display: 'Chase',
    keywords: ['Chase', 'Chase Bank', 'JPMorgan Chase', 'JPMorgan Chase Bank', 'J.P. Morgan'],
    commonWord: true,
    canonical: ['chase.com', 'jpmorganchase.com', 'jpmorgan.com'],
    primary: '1-800-935-9935',
    numbers: [
      // https://www.chase.com/digital/customer-service
      '8009359935', // customer service / personal banking
      '8004323117', // credit card customer service
      '8003366675', // auto loans and leases
      '8008489136', // home lending
      '8003925749', // J.P. Morgan Wealth Management
      '8774690110', // Military Services, domestic
      // https://www.chase.com/business/contact-us
      '8002427338', // Chase Business (1-800-CHASE38), also ACH support
      '8774258100', // Business Platinum
      '8006067615', // cash management
      '8009452028', // Ink business credit cards
      '8888868869', // Payment Solutions (merchant services)
      '8665642262', // customer claims / business fraud reporting
      '8009788664', // debit card fraud prevention (business)
      '8668723321', // ACCESS and payable web service
      '8002356286', // ARP and controlled disbursement
      // https://www.chase.com/digital/resources/privacy-security/security/report-fraud
      '8009559060', // personal / Sapphire credit card fraud
      '8007040285', // business credit card fraud
      '8002275151', // auto leases
    ],
  },
  {
    display: 'Bank of America',
    keywords: ['Bank of America', 'BofA', 'Bank of America, N.A.'],
    canonical: ['bankofamerica.com', 'bofa.com'],
    primary: '800.432.1000',
    numbers: [
      // https://www.bankofamerica.com/customer-service/contact-us/checking-savings/
      '8004321000', // general customer service
      '8006886086', // customer service in Spanish
      // https://www.bankofamerica.com/customer-service/contact-us/credit-card/
      '8007329194', // credit card customer service (incl. lost/stolen)
      '8002769939', // credit card activation
      '8662660212', // credit card billing inquiries
      '8004348313', // rewards redemption
      // https://www.bankofamerica.com/deposits/contact-bank-of-america-faqs/
      '8443757028', // appointment scheduling
      // https://www.bankofamerica.com/customer-service/contact-us/about-bank-of-america/
      '8002189946', // philanthropy / community programs
      // https://www.bankofamerica.com/customer-service/contact-us/atms/
      '8444018500', // ATM problem reporting
      // https://www.bankofamerica.com/customer-service/contact-us/auto-loans/
      '8448926002', // auto loans, new customers
      '8002156195', // auto loans, existing customers
      // https://www.bankofamerica.com/customer-service/contact-us/cds-iras/
      '8888271812', // CDs
      // https://www.bankofamerica.com/customer-service/contact-us/mortgage-home-equity/
      '8006696607', // existing mortgages (also mortgage fraud)
      '8007793894', // new home equity applications
      '8009345626', // existing home equity accounts
      '8002705746', // new mortgage applications
      // https://www.bankofamerica.com/customer-service/contact-us/privacy-security/
      '8773661121', // fraud reporting, ATM or debit charges
      '8883415000', // privacy choices
      // https://www.bankofamerica.com/customer-service/contact-us/small-business-banking/
      '8882874637', // small business servicing (888.BUSINESS)
      '8662834075', // small business, open an account
      '8772701242', // Remote Deposit Online support
      '8333442324', // Merchant Services support
      '8667585972', // small business Online Banking support
    ],
  },
  {
    display: 'Wells Fargo',
    keywords: ['Wells Fargo', 'Wells Fargo Bank', 'WellsFargo'],
    canonical: ['wellsfargo.com', 'wf.com', 'wellsfargoadvisors.com'],
    primary: '1-800-869-3557',
    numbers: [
      // https://www.wellsfargo.com/help/contact-us/
      '8008693557', // general banking (also personal fraud + debit cards)
      '8007424932', // Premier client service
      '8005560605', // ExpressSend
      '8009564442', // Wells Fargo Online / Business Online
      '8558722932', // Military Banking (1-855-USA-2WFB)
      '8006424720', // credit card account management
      '8778057744', // retail credit card
      '8009679521', // credit card application status
      '8775171358', // rewards redemption
      '8662348271', // home mortgage customer service
      '8779379357', // mortgage financing
      '8669367272', // mortgage military customer service
      '8664393557', // home equity (1-866-HE-WELLS)
      '8002898004', // auto loans
      '8775266332', // personal loans, new accounts
      '8009462626', // personal lines of credit
      '8772696056', // personal loans and Flex Loans
      '8662817436', // Wells Fargo Advisors brokerage, current customers
      '8662430931', // Wells Fargo Advisors brokerage, new customers
      '8008723377', // WellsTrade, existing accounts (1-800-TRADERS)
      '8775737997', // WellsTrade, new customers
      '8552835565', // Intuitive Investor, existing accounts
      '8552835567', // Intuitive Investor, new customers
      '8774934727', // new IRAs and rollovers
      '8003523705', // trust and managed investments
      '8887150380', // Private Wealth
      '8665523312', // First Clearing Access Online
      // https://www.wellsfargo.com/privacy-security/fraud/report/
      '8002255935', // business customer service (1-800-CALL-WELLS), business fraud
      '8668675568', // online payment / transfer / profile fraud
      '8002893557', // commercial account fraud (US, Canada, Mexico)
      '8005489554', // debit card claim status
      '8004237618', // credit card claim status
      // https://www.wellsfargo.com/biz/help/faqs/accounts/
      '8004168658', // small business accounts
      // https://www.wellsfargo.com/biz/help/
      '8882458454', // business Direct Pay
      '8663809828', // Merchant Services consultant
      '8004515817', // Merchant Services existing customers
      // https://www.wellsfargo.com/biz/help/apply/
      '8006287816', // healthcare practitioner financing
      '8669029181', // business lines of credit
    ],
  },
  {
    display: 'USPS',
    // Bare "Postal Service" is deliberately absent: it names any country's postal service
    // ("contact the Postal Service" on a Canada Post FAQ would read as a fake USPS line).
    keywords: ['USPS', 'U.S. Postal Service', 'US Postal Service', 'United States Postal Service', 'USPS Tracking'],
    canonical: ['usps.com', 'usps.gov', 'uspis.gov'],
    primary: '1-800-275-8777',
    numbers: [
      // https://www.usps.com/help/contact-us.htm
      '8002758777', // Customer Care Center (1-800-ASK-USPS)
      '8003447779', // technical support (Click-N-Ship, claims, PO Boxes, accounts)
      '8002221811', // domestic and international tracking
      '8447377826', // stamps / Postal Store orders
      '8006108734', // free shipping supplies
    ],
  },
  {
    display: 'UPS',
    keywords: ['UPS', 'United Parcel Service', 'UPS Customer Service', 'UPS My Choice'],
    commonWord: true,
    canonical: ['ups.com', 'theupsstore.com'],
    primary: '1-800-742-5877',
    numbers: [
      // https://www.ups.com/us/en/support/contact-us
      '8007425877', // customer service (1-800-PICK-UPS)
      '8007827892', // international shipping support
      '8772896418', // technical support
      '8886824652', // freight, truckload
      '8004436379', // air freight
      '8003508440', // ocean freight
      '8008111648', // domestic billing
      '8664937140', // import billing
      // https://locations.ups.com/us/en/nc/raleigh/customer-center-134796.html
      '8887425877', // number on UPS Customer Center locator listings
    ],
  },
  {
    display: 'FedEx',
    keywords: ['FedEx', 'Federal Express', 'FedEx Express', 'FedEx Ground', 'FedEx Freight'],
    // fedexfreight.com is not FedEx Corp's (FedEx Freight became independent 2026-06-01, per
    // fedex.com's call-us page), but it is the legitimate home of the "FedEx Freight" name —
    // not impersonation, so it is exempt like a canonical domain.
    canonical: ['fedex.com', 'fedexfreight.com'],
    primary: '1.800.463.3339',
    numbers: [
      // https://www.fedex.com/en-us/customer-support/call-us.html
      '8004633339', // customer service, US and Canada (1.800.GoFedEx)
      '8006221147', // US billing inquiries
      '8003320807', // US air freight
      '8002492953', // FedEx Logistics US/Canada/Mexico border
      // https://www.fedex.com/en-ca/customer-support/call-us.html
      '8773392774', // technical support (US and Canada)
    ],
  },
  {
    display: 'Amazon',
    keywords: ['Amazon', 'Amazon.com', 'Amazon Prime', 'Amazon Customer Service'],
    commonWord: true,
    canonical: ['amazon.com', 'amazon.ca', 'aboutamazon.com', 'primevideo.com'],
    primary: '1-888-280-4331',
    numbers: [
      // https://www.amazon.com/buying-rules/learn-more
      // (also https://www.amazon.com/gp/help/customer/display.html?nodeId=508510)
      '8882804331', // Customer Service, US
    ],
  },
  {
    display: 'PayPal',
    keywords: ['PayPal', 'PayPal Credit', 'PayPal Customer Service'],
    canonical: ['paypal.com', 'paypal.me'],
    primary: '1-888-221-1161',
    numbers: [
      // https://www.paypal.com/us/security/learn-about-fake-messages
      '8882211161', // customer service, US
      // https://www.paypal.com/us/legalhub/paypal/privacy-full
      '8447053555', // Fastlane profiles
      '8775468220', // Hyperwallet
      '8778151531', // Xoom
      // https://www.paypal.com/us/legalhub/paypal/useragreement-full
      '8446299108', // text-message opt-out
      // https://www.paypal.com/us/security/report-fraud
      '8668886080', // Business Debit Mastercard, lost/stolen + unauthorized
    ],
  },
];

/** Real lines that legitimately sit beside a listed brand's name but are NOT that brand's
 *  support number — a card issuer, a spun-off company, an oversight body, an overseas-only
 *  desk. Each was found on the brand's own pages and its true owner confirmed by the
 *  verifier. Never shown as {canonical}; a page displaying one simply isn't impersonating. */
export const THIRD_PARTY_PHONES_ALLOW: readonly string[] = [
  // irs.gov ("Contact my local office internationally"; report-fraud page)
  '5124167750', // IRS e-help desk, Austin — overseas callers only
  '8003664484', // TIGTA hotline for reporting IRS impersonation (Treasury IG, not the IRS)
  // https://www.bankofamerica.com/customer-service/contact-us/small-business-banking/
  '8886064545', // Intuit Online Payroll support
  // https://www.wellsfargo.com/biz/help/ and /biz/help/apply/
  '8002378982', // Harland Clarke (Wells Fargo business checks)
  '8338181800', // ADP payroll
  // ups.com contact page; https://www.tforcefreight.com/ltl/apps/ContactUs
  '8003337400', // TForce Freight (formerly UPS Freight)
  // fedex.com packing guide; fedexfreight.com
  '8663934585', // FedEx Freight LTL customer service
  // amazon.com help, nodeId=202029400 (co-branded card issuers)
  '8882474080', // Chase — Amazon Visa / Prime Visa
  '8666348379', // Synchrony — Amazon.com Store Card
  '8555974891', // Synchrony — Amazon Secured Card
  '8336747268', // American Express — Amazon Business American Express Card
  '8334264690', // U.S. Bank — Amazon Business Card / Prime Business Card
  // paypal.com help471 + FAQ4636; https://www.paypal.com/us/security/report-fraud
  '8443734961', // Synchrony — PayPal Credit digital line
  '8442097457', // Synchrony — PayPal Credit Card
  '8555200991', // Synchrony — PayPal Cashback Mastercard (PayPal's own pages disagree on it)
];

// ---------------------------------------------------------------------------
// Webmail surface (heuristic-ruleset §3.4): `sender-domain-mismatch` + `reply-to-mismatch`.
// Interim home for the companion repo's sender lists; the webmail hosts live in
// webmail-hosts.ts, because the content script reads them (re-exported here).
// Gathered 2026-10-21. Where a brand publishes its sending addresses the source is that
// brand's own help page; five brands (Bank of America, Chase, Wells Fargo, PayPal, Apple)
// publish none, so their lists come from Sublime Security's open-source detection rules
// (github.com/sublime-security/sublime-rules, MIT, commit 90939afe) cross-checked in DNS
// (DMARC policy, registrar). Corroborated, not brand-published — treat them as such.
// ---------------------------------------------------------------------------

export { WEBMAIL_HOSTS, type WebmailProvider } from './webmail-hosts';

export interface BrandSender {
  /** Name shown to the user ("This email isn't really from {brand}."). */
  display: string;
  /** Phrases that name the brand anywhere in a display name (whole words, case-insensitive). */
  keywords: readonly string[];
  /** Brand names that are also everyday words or first names ("Chase", "Apple", "UPS"). They
   *  count only when the display name is the brand alone or with brand-context words
   *  (BRAND_CONTEXT_WORDS) — so "Chase Alerts" names the bank and "Chase Miller" does not. */
  bareKeywords?: readonly string[];
  /** Context words that keep THIS brand's bare keyword a claim, on top of the shared
   *  BRAND_CONTEXT_WORDS — words that name the brand only beside its own name ("Chase Online
   *  Banking" is the bank; "Apple Bank" is not Apple). */
  contextWords?: readonly string[];
  /** The bare keyword is a common first name: a display name that is ONLY that word, from a
   *  free-webmail address, is a person, not a brand claim ("Chase" <chase.m.0142@gmail.com>). */
  bareIsFirstName?: boolean;
  /** Legit mail naming this brand also comes from partners we cannot enumerate, so flag only a
   *  From that is free webmail or carries one of these tokens in its domain. */
  partnerRelayTokens?: readonly string[];
  /** Sender domains (a subdomain counts), exact domains ("@domain") or exact addresses
   *  ("local@domain") the brand mails from (origin.ts sendsAs). Never a domain where anyone can
   *  get a mailbox or subdomain — free webmail (icloud.com, outlook.com), amazonaws.com,
   *  onmicrosoft.com, sharepoint.com. Also phone-number-impersonation's sender path (Sender
   *  paths, above), so every entry's DMARC enforces at the level it matches. */
  senders: readonly string[];
  /** The brand's real senders whose DMARC does not enforce (p=none, measured 2026-10-21).
   *  Mail from one is no mismatch — the name is true — but anyone can forge that From, so it
   *  never exempts a content or phone rule (origin.ts). */
  unenforcedSenders?: readonly string[];
}

/** `sender-domain-mismatch`: a display name naming one of these brands, From a domain not on
 *  its list. Not the BRAND_IMPERSONATION host list — mail and web domains differ per brand. */
export const BRAND_SENDERS: readonly BrandSender[] = [
  {
    // BofA lists no senders; bofa.com is DMARC-authorized by bankofamerica.com,
    // bofamerchantservices.com is p=reject via BofA's Agari mailbox. 'BOA' left out: an
    // ordinary word other organisations use.
    display: 'Bank of America',
    keywords: ['Bank of America', 'BankofAmerica', 'BofA'],
    senders: ['bankofamerica.com', 'bofa.com', 'bofamerchantservices.com'],
  },
  {
    // Chase lists no senders. Never chaseonline.com — Chase's own page uses it as the
    // example of a fake sender. 'Chase' is a first name and arena name (Chase Center).
    display: 'Chase',
    keywords: [
      'Chase Bank', 'JPMorgan Chase', 'JP Morgan Chase', 'J.P. Morgan', 'Chase Sapphire',
      'Chase Card Services', 'Chase Freedom', 'eChase',
    ],
    bareKeywords: ['Chase'],
    // Only 'Chase Bank' is a full keyword; "Chase Online Banking" and "Chase Banking Alerts"
    // need these beside the bare name.
    contextWords: ['bank', 'banking'],
    bareIsFirstName: true,
    senders: ['chase.com', 'jpmorgan.com', 'jpmchase.com', 'jpmorganchase.com', 'chasetravel.com', 'chaseoffers.com'],
  },
  {
    // wellsfargo.com publishes DMARC report authorizations for the four mail domains
    // (negative control clean); wf.com shares Wells Fargo's Proofpoint tenant.
    display: 'Wells Fargo',
    keywords: ['Wells Fargo', 'WellsFargo'],
    senders: [
      'wellsfargo.com', 'wf.com', 'wellsfargoemail.com', 'wellsfargoadvisors.com',
      'wfadvisors.com', 'wellsfargorewards.com',
    ],
  },
  {
    // PayPal lists no senders; country + survey domains from Sublime, each MarkMonitor +
    // p=reject. xoom.com / zettle.com are PayPal-owned brands (MarkMonitor, p=reject) whose
    // mail may say "by PayPal". paypal.co.br is not on the PSL — left out.
    display: 'PayPal',
    keywords: ['PayPal', 'Pay Pal'],
    senders: [
      'paypal.com', 'paypal.co.uk', 'paypal.ca', 'paypal.com.au', 'paypal.de', 'paypal.fr',
      'paypal.es', 'paypal.it', 'paypal.nl', 'paypal.be', 'paypal.at', 'paypal.ch', 'paypal.dk',
      'paypal.se', 'paypal.pl', 'paypal.com.mx', 'paypal.com.sg', 'paypal.hk', 'paypal.co.il',
      'paypalcorp.com', 'paypal-experience.com', 'paypal-customerfeedback.com',
      'paypal-brandsfeedback.com', 'paypal-creditsurvey.com', 'paypal-prepaid.com',
      'xoom.com', 'zettle.com',
    ],
  },
  {
    // Amazon's help pages: approved mail is "sent from an amazon.com email address"; the
    // rest is Sublime's. Bare 'Amazon' only as the whole name, as Sublime does ("X on
    // Amazon"). Never amazonaws.com (sp=none, EC2 hostnames) or awsapps.com (customer
    // subdomains).
    display: 'Amazon',
    keywords: ['Amazon.com', 'Amazon Prime', 'Amazon Pay', 'Amazon Customer Service'],
    bareKeywords: ['Amazon'],
    senders: [
      'amazon.com', 'amazon.ca', 'amazon.com.mx', 'amazon.com.br', 'amazon.co.uk', 'amazon.de',
      'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.nl', 'amazon.se', 'amazon.ie', 'amazon.lu',
      'amazon.in', 'amazon.co.jp', 'amazon.com.au', 'amazon.sg', 'amazon.com.sg', 'amazon.ae',
      'amazon.sa', 'amazon.com.tr', 'amazon.cn', 'amazonpay.com', 'amazonpay.in',
      'amazonsellerservices.com', 'aws.com', 'amazon.jobs',
    ],
  },
  {
    // Apple lists no senders; addresses from an Apple Community guide, DNS-backed (Com
    // Laude, p=reject). icloud.com / me.com / mac.com are FREE WEBMAIL — only the narrow
    // insideicloud subdomain is Apple's. Bare 'Apple': Apple FCU, Big Apple, Fiona Apple.
    display: 'Apple',
    keywords: ['Apple Support', 'Apple ID', 'Apple Account', 'iCloud', 'App Store', 'Apple Pay', 'iTunes'],
    bareKeywords: ['Apple'],
    senders: ['apple.com', 'itunes.com', 'applemusic.com', 'insideicloud.icloud.com'],
  },
  {
    // Microsoft: "@accountprotection.microsoft.com ... it is safe to trust the message"
    // (support.microsoft.com). mail.microsoft sits under Microsoft's own TLD. Never
    // outlook/hotmail/live/msn (free webmail) or onmicrosoft.com/sharepoint.com (anyone gets a
    // tenant). Bare 'Outlook', 'Teams', 'OneDrive' left out — everyday words ("Weekly Outlook").
    display: 'Microsoft',
    keywords: ['Microsoft', 'Office 365', 'Office365', 'Windows Defender', 'Windows Security'],
    senders: ['microsoft.com', 'microsoftonline.com', 'office.com', 'office365.com', 'xbox.com', 'mail.microsoft'],
    unenforcedSenders: ['microsoftstoreemail.com'],
  },
  {
    // USPS's own Informed Delivery page names USPSInformeddelivery@email.informeddelivery.usps.com.
    display: 'USPS',
    keywords: ['USPS', 'U.S. Postal Service', 'US Postal Service', 'United States Postal Service', 'Informed Delivery'],
    senders: ['usps.com'],
  },
  {
    // UPS's fraud page (seen via search snippets — it blocks fetches): ups.com, upsemail.com
    // (p=reject). 'ups' is an everyday word ("Pop-Ups", "Start-Ups").
    display: 'UPS',
    keywords: ['United Parcel Service', 'UPS My Choice'],
    bareKeywords: ['UPS'],
    senders: ['ups.com', 'upsemail.com'],
  },
  {
    // FedEx: "an official FedEx email address (Name@fedex.com)". fedexfreight.com: FedEx Freight
    // has been independent since 2026-06-01 but is the legitimate home of the "FedEx Freight"
    // name, as on the phone list (CANONICAL_PHONES) — so its mail is no impostor either.
    // p=reject pct=100, no sp (measured 2026-10-21).
    display: 'FedEx',
    keywords: ['FedEx', 'Fed Ex', 'Federal Express'],
    senders: ['fedex.com', 'fedexfreight.com'],
  },
  {
    // irs.gov: account notifications "from email address ending in irs.gov"; News Bulletins
    // "from irs@service.govdelivery.com". That GovDelivery domain is shared by many agencies,
    // so only the exact address — never the domain — and p=none, so it never exempts.
    display: 'IRS',
    keywords: ['IRS', 'Internal Revenue Service', 'IRS.gov'],
    senders: ['irs.gov'],
    unenforcedSenders: ['irs@service.govdelivery.com'],
  },
  {
    // SSA OIG: the fake "does NOT have '.gov' as part of the sender's address". Bare forms:
    // disability-law firms put "Social Security" in their names; other organisations use "SSA".
    display: 'Social Security',
    keywords: ['Social Security Administration', 'my Social Security'],
    bareKeywords: ['Social Security', 'SSA'],
    senders: ['ssa.gov'],
  },
  {
    // Netflix's help pages name its senders; all but the preview club sit under netflix.com.
    display: 'Netflix',
    keywords: ['Netflix'],
    senders: ['netflix.com', 'netflixpreviewclub.com'],
  },
  {
    // Venmo: "Venmo will only email you from an email address ending in 'venmo.com'".
    display: 'Venmo',
    keywords: ['Venmo'],
    senders: ['venmo.com'],
  },
  {
    // Zelle: "The only domain extension used by Zelle® is @Zelle.com or @Zellepay.com" — BUT
    // payment notices "may be sent by Zelle® or by their bank or credit union", from
    // thousands of member-bank domains. Hence partnerRelayTokens.
    display: 'Zelle',
    keywords: ['Zelle'],
    partnerRelayTokens: ['zelle', 'zellepay'],
    senders: ['zelle.com', 'zellepay.com'],
  },
  {
    // Cash App: "always come from a @cash.app, @square.com, @surveys.squareup.com, or
    // @squareup.com address"; investing mail from support@drivewealth.com, a broker serving
    // many apps — so that exact address, not the domain. Never bare 'Cash' (a surname).
    display: 'Cash App',
    keywords: ['Cash App', 'CashApp', 'Cash-App'],
    senders: ['cash.app', 'square.com', 'squareup.com', 'support@drivewealth.com'],
  },
];

/** Third parties that legitimately send mail under a brand's name — kept off the per-brand
 *  lists so each stays the brand's own: Broadridge shareholder mail, Q4 investor-relations
 *  alerts, TransUnion credit monitoring, Synchrony co-brand cards (PayPal Credit, the Venmo
 *  card, the Amazon Store Card), Cartera's Chase shopping portal (DMARC p=none — weak).
 *  Mail senders only, never the brand's websites: shopping-chase.com serves no site (no
 *  address record, 2026-10-21) under a privacy-proxied registrant, so it stays off Chase's
 *  BRAND_IMPERSONATION list and a page on it would still read as impersonation. */
export const ON_BEHALF_SENDERS: readonly string[] = [
  'proxyvote.com', 'investordelivery.com', 'q4inc.com', 'transunion.com', 'synchrony.com',
  'synchronybank.com', 'shopping-chase.com',
];

/** A listed brand's own addresses whose display name carries a name the brand's CUSTOMER
 *  chose, beside the brand's: mail from one proves the platform sent it, and nothing about
 *  any other brand the name claims (sender-domain-mismatch then judges those alone). Exact
 *  addresses only (origin.ts sendsAs) — never a whole brand domain, whose co-branded mail
 *  ("Amazon Pay | PayPal") is the brand writing.
 *  - invites@microsoft.com: Microsoft Entra B2B invitations, "Microsoft Invitations on behalf
 *    of <tenant name>", and anyone can create a tenant and name it "PayPal Billing". Microsoft
 *    has sent new invitations from the inviting tenant's own domain since December 2025
 *    (learn.microsoft.com/entra/external-id/invitation-email-elements, read 2026-10-21), so
 *    this covers the invitations still sitting in inboxes. */
export const CUSTOMER_NAMED_SENDERS: readonly string[] = ['invites@microsoft.com'];

/** Words that may accompany a bare brand keyword and keep it a brand claim ("Chase Fraud
 *  Alerts", "Apple Support Team", "Chase.com"). Deliberately no "store" (The UPS Store is a
 *  franchise mailing from its own domain), no venue words, and no banking words: beside
 *  another brand's name they name a different bank — "Apple Bank" is Apple Bank for Savings
 *  (applebank.com), a New York bank — so a bank adds them itself (BrandSender.contextWords). */
export const BRAND_CONTEXT_WORDS: readonly string[] = [
  'alert', 'alerts', 'support', 'security', 'service', 'services', 'team',
  'customer', 'customers', 'account', 'accounts', 'online', 'notification', 'notifications',
  'notice', 'card', 'cards', 'credit', 'billing', 'help', 'care', 'fraud', 'department',
  'dept', 'verification', 'delivery', 'tracking', 'shipping', 'official', 'com', 'inc',
];

/** A brand keyword directly followed by one of these names a venue or event, not the brand
 *  writing to you: "Wells Fargo Center", "Chase Field", "Wells Fargo Championship" tickets. */
export const VENUE_WORDS: readonly string[] = [
  'center', 'centre', 'arena', 'field', 'stadium', 'championship', 'pavilion', 'amphitheater',
  'amphitheatre', 'theater', 'theatre', 'plaza', 'tower',
];

/** Mailbox domains anyone can sign up for — free webmail plus the ISP mailboxes that carry
 *  the same reputation weight. Every entry is in Sublime's free_email_providers list (22,588
 *  entries, MIT — the companion repo could vendor it whole). A subdomain counts (Roadrunner
 *  hands out nc.rr.com, twcny.rr.com). skiff.com (shut down) and hey.com (not in Sublime's
 *  list) dropped. */
export const FREE_WEBMAIL_DOMAINS: readonly string[] = [
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'ymail.com', 'rocketmail.com', 'yahoo.co.uk', 'yahoo.ca', 'yahoo.com.au',
  'yahoo.co.nz', 'yahoo.ie', 'yahoo.co.in', 'yahoo.in', 'yahoo.fr', 'yahoo.de', 'yahoo.es',
  'yahoo.it', 'yahoo.co.jp', 'yahoo.com.br', 'yahoo.com.mx', 'yahoo.com.ar', 'yahoo.com.ph',
  'yahoo.com.sg', 'yahoo.com.hk', 'yahoo.com.tw', 'yahoo.com.vn', 'yahoo.co.id', 'yahoo.co.th',
  'yahoo.co.za', 'yahoo.se', 'yahoo.dk', 'yahoo.no', 'yahoo.gr', 'yahoo.ro', 'yahoo.pl',
  'outlook.com', 'outlook.fr', 'outlook.de', 'outlook.es', 'outlook.it', 'outlook.jp',
  'outlook.com.au', 'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.it',
  'hotmail.es', 'hotmail.ca', 'hotmail.com.au', 'hotmail.nl', 'live.com', 'live.co.uk',
  'live.ca', 'live.fr', 'live.de', 'live.it', 'live.nl', 'live.com.au', 'msn.com',
  'windowslive.com',
  'aol.com', 'aim.com', 'aol.co.uk', 'aol.de', 'aol.fr',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'protonmail.ch', 'proton.me', 'pm.me',
  'gmx.com', 'gmx.net', 'gmx.de', 'gmx.at', 'gmx.us', 'gmx.co.uk', 'web.de',
  'mail.com', 'email.com', 'usa.com', 'post.com', 'myself.com', 'consultant.com',
  'zoho.com', 'zohomail.com',
  'yandex.com', 'yandex.ru', 'ya.ru', 'mail.ru', 'inbox.ru', 'list.ru', 'bk.ru', 'rambler.ru',
  'tutanota.com', 'tutanota.de', 'tuta.io', 'fastmail.com', 'fastmail.fm', 'hushmail.com',
  'mailfence.com', 'mailbox.org', 'posteo.de', 'duck.com', 'inbox.com', 'lycos.com', 'excite.com',
  // ISP mailboxes — not free, but anyone can get one, and much of our audience uses them.
  'att.net', 'sbcglobal.net', 'bellsouth.net', 'pacbell.net', 'swbell.net', 'ameritech.net',
  'prodigy.net', 'comcast.net', 'verizon.net', 'cox.net', 'charter.net', 'rr.com',
  'roadrunner.com', 'twc.com', 'earthlink.net', 'optonline.net', 'frontier.com',
  'frontiernet.net', 'centurylink.net', 'q.com', 'embarqmail.com', 'windstream.net',
  'mchsi.com', 'juno.com', 'netzero.net', 'shaw.ca', 'rogers.com', 'sympatico.ca', 'telus.net',
  'btinternet.com', 'btopenworld.com', 'sky.com', 'virginmedia.com', 'ntlworld.com',
  'talktalk.net', 'bigpond.com', 'orange.fr', 'wanadoo.fr', 'free.fr', 'laposte.net',
  'libero.it', 't-online.de', 'seznam.cz', 'wp.pl', 'o2.pl', 'interia.pl', 'onet.pl', 'ukr.net',
  'qq.com', '163.com', '126.com', 'sina.com', 'naver.com', 'hanmail.net', 'daum.net',
  'rediffmail.com',
];

/** Alias domains of ONE mailbox provider. `reply-to-mismatch` treats a family as one
 *  provider, or someone's own hotmail→outlook (or sbcglobal→att) pair reads as a mismatch.
 *  The first nine groups are the research's; the rest are same-company alias domains. */
export const WEBMAIL_PROVIDER_FAMILIES: readonly (readonly string[])[] = [
  ['gmail.com', 'googlemail.com'],
  [
    'outlook.com', 'outlook.fr', 'outlook.de', 'outlook.es', 'outlook.it', 'outlook.jp',
    'outlook.com.au', 'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.it',
    'hotmail.es', 'hotmail.ca', 'hotmail.com.au', 'hotmail.nl', 'live.com', 'live.co.uk',
    'live.ca', 'live.fr', 'live.de', 'live.it', 'live.nl', 'live.com.au', 'msn.com',
    'windowslive.com',
  ],
  [
    'yahoo.com', 'ymail.com', 'rocketmail.com', 'yahoo.co.uk', 'yahoo.ca', 'yahoo.com.au',
    'yahoo.co.nz', 'yahoo.ie', 'yahoo.co.in', 'yahoo.in', 'yahoo.fr', 'yahoo.de', 'yahoo.es',
    'yahoo.it', 'yahoo.co.jp', 'yahoo.com.br', 'yahoo.com.mx', 'yahoo.com.ar', 'yahoo.com.ph',
    'yahoo.com.sg', 'yahoo.com.hk', 'yahoo.com.tw', 'yahoo.com.vn', 'yahoo.co.id',
    'yahoo.co.th', 'yahoo.co.za', 'yahoo.se', 'yahoo.dk', 'yahoo.no', 'yahoo.gr', 'yahoo.ro',
    'yahoo.pl',
  ],
  ['icloud.com', 'me.com', 'mac.com'],
  ['protonmail.com', 'protonmail.ch', 'proton.me', 'pm.me'],
  ['aol.com', 'aim.com', 'aol.co.uk', 'aol.de', 'aol.fr'],
  ['yandex.com', 'yandex.ru', 'ya.ru'],
  ['gmx.com', 'gmx.net', 'gmx.de', 'gmx.at', 'gmx.us', 'gmx.co.uk'],
  ['mail.com', 'email.com', 'usa.com', 'post.com', 'myself.com', 'consultant.com'],
  ['mail.ru', 'inbox.ru', 'list.ru', 'bk.ru'],
  ['zoho.com', 'zohomail.com'],
  ['tutanota.com', 'tutanota.de', 'tuta.io'],
  ['fastmail.com', 'fastmail.fm'],
  ['att.net', 'sbcglobal.net', 'bellsouth.net', 'pacbell.net', 'swbell.net', 'ameritech.net', 'prodigy.net'],
  ['charter.net', 'rr.com', 'roadrunner.com', 'twc.com'],
  ['frontier.com', 'frontiernet.net'],
  ['centurylink.net', 'q.com', 'embarqmail.com'],
  ['juno.com', 'netzero.net'],
  ['btinternet.com', 'btopenworld.com'],
  ['virginmedia.com', 'ntlworld.com'],
  ['orange.fr', 'wanadoo.fr'],
  ['163.com', '126.com'],
  ['hanmail.net', 'daum.net'],
];

/** Reply-To destinations that are a mailing list answering for a free-webmail poster, not a
 *  hijacked reply: gmail.com/outlook.com are DMARC p=none, so lists keep the poster's From
 *  and point Reply-To at the list. googlegroups.com is Sublime's explicit exception; groups.io
 *  is inferred from the same mechanism (thin). A known hole: scammers abuse Google Groups'
 *  "via" + Reply-To. */
export const REPLY_TO_PLATFORMS_ALLOW: readonly string[] = ['googlegroups.com', 'groups.io'];
