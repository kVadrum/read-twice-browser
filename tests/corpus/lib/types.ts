// Fixture metadata — the YAML sidecar of each corpus fixture (testing-strategy §2.2).
// `expected_*` are what calibration measures against; the rest is provenance/hygiene.

export interface FixtureMeta {
  id: string;
  label: 'scam' | 'legit';
  /** Designed outcome: reds/yellows for scams, `none` for legit. Optional — defaults
   *  to `yellow` for scams / `none` for legit when omitted. */
  expected_severity?: 'red' | 'yellow' | 'none';
  /** Rule ids that should appear in the verdict (scam fixtures). */
  expected_rules?: string[];
  /** Page host. Drives the synthetic document URL the extractor reads. */
  domain: string;
  /** Feeds the RDAP context (domain-age-young). null/omitted → rdap is null. */
  domain_age_days?: number | null;
  redirect_chain?: string[];
  notes?: string;
  source?: string;
  captured_at?: string;
}

export interface LoadedFixture {
  meta: FixtureMeta;
  html: string;
}
