// ============================================================
// Hawaiʻi Dashboard - Question Bundles
//
// Each bundle is a resident-voice question that maps to a curated
// subset of metrics. Order: daily costs, safety, health, children,
// infrastructure, civic, then the verdict (are people leaving).
//
// view key: t = trend, r = rank, rh = rank-history, c = county
// ============================================================

const BUNDLES = [ // eslint-disable-line no-unused-vars
    {
        id: 'affordability',
        title: 'Can we still afford to live here?',
        metrics: [
            { id: 'renter_cost_burden_pct',  view: 'rh' },
            { id: 'home_price_to_income',    view: 'rh' },
            { id: 'residential_price_cpkwh', view: 't'  },
            { id: 'food_insecurity_rate',    view: 't'  },
            { id: 'real_per_capita_income',  view: 'rh' },
        ],
    },
    {
        id: 'homelessness',
        title: 'Is homelessness getting worse?',
        metrics: [
            { id: 'unsheltered_homeless_rate', view: 't'  },
            { id: 'renter_cost_burden_pct',    view: 'rh' },
            { id: 'home_price_to_income',      view: 'rh' },
            { id: 'food_insecurity_rate',      view: 't'  },
        ],
    },
    {
        id: 'safety',
        title: 'Is it actually getting safer?',
        metrics: [
            { id: 'violent_crime_rate',  view: 't'  },
            { id: 'property_crime_rate', view: 'rh' },
        ],
    },
    {
        id: 'mental-health',
        title: 'Is the mental health crisis real?',
        metrics: [
            { id: 'suicide_rate',    view: 't'  },
            { id: 'pcp_per_100k',    view: 'r'  },
            { id: 'uninsured_rate',  view: 'rh' },
        ],
    },
    {
        id: 'health-care',
        title: 'Can I see a doctor when I need one?',
        metrics: [
            { id: 'pcp_per_100k',   view: 'r'  },
            { id: 'uninsured_rate', view: 'rh' },
        ],
    },
    {
        id: 'education',
        title: 'Are our kids learning enough?',
        metrics: [
            { id: 'naep_math_8',       view: 'rh' },
            { id: 'naep_reading_8',    view: 'rh' },
            { id: 'acgr',              view: 't'  },
            { id: 'ba_or_higher_pct',  view: 'rh' },
        ],
    },
    {
        id: 'energy',
        title: 'Why is my electric bill so high?',
        metrics: [
            { id: 'residential_price_cpkwh', view: 't'  },
            { id: 'renewables_share_gen',    view: 't'  },
        ],
    },
    {
        id: 'resilience',
        title: 'Are we ready for the next disaster?',
        metrics: [
            { id: 'rainy_day_fund_pct',        view: 't'  },
            { id: 'road_poor_pct',             view: 'rh' },
            { id: 'broadband_subscription_pct', view: 'rh' },
            { id: 'renewables_share_gen',       view: 't'  },
        ],
    },
    {
        id: 'civic',
        title: 'Does my vote even matter here?',
        metrics: [
            { id: 'voter_participation_rate', view: 'rh' },
        ],
    },
    {
        id: 'leaving',
        title: 'Are people leaving?',
        metrics: [
            { id: 'net_domestic_migration_rate', view: 't'  },
            { id: 'real_per_capita_income',      view: 'rh' },
            { id: 'labor_productivity',          view: 't'  },
            { id: 'labor_force_participation',   view: 't'  },
            { id: 'estabs_entry_rate',           view: 't'  },
            { id: 'net_employer_formation',      view: 'r'  },
        ],
    },
];
