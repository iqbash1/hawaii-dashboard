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
        title: 'How affordable is life here?',
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
        title: 'What\'s happening with homelessness?',
        metrics: [
            { id: 'unsheltered_homeless_rate', view: 't'  },
            { id: 'renter_cost_burden_pct',    view: 'rh' },
            { id: 'home_price_to_income',      view: 'rh' },
            { id: 'food_insecurity_rate',      view: 't'  },
        ],
    },
    {
        id: 'safety',
        title: 'How safe is it really?',
        metrics: [
            { id: 'violent_crime_rate',  view: 't'  },
            { id: 'property_crime_rate', view: 'rh' },
        ],
    },
    {
        id: 'mental-health',
        title: 'How serious is the mental health gap?',
        metrics: [
            { id: 'suicide_rate',    view: 't'  },
            { id: 'pcp_per_100k',    view: 'r'  },
            { id: 'uninsured_rate',  view: 'rh' },
        ],
    },
    {
        id: 'health-care',
        title: 'How easy is it to see a doctor?',
        metrics: [
            { id: 'pcp_per_100k',   view: 'r'  },
            { id: 'uninsured_rate', view: 'rh' },
        ],
    },
    {
        id: 'education',
        title: 'How are our kids doing in school?',
        metrics: [
            { id: 'naep_math_8',       view: 'rh' },
            { id: 'naep_reading_8',    view: 'rh' },
            { id: 'acgr',              view: 't'  },
            { id: 'ba_or_higher_pct',  view: 'rh' },
        ],
    },
    {
        id: 'energy',
        title: 'Is the shift to renewables lowering electric bills?',
        metrics: [
            { id: 'residential_price_cpkwh', view: 't'  },
            { id: 'renewables_share_gen',    view: 't'  },
        ],
    },
    {
        id: 'resilience',
        title: 'How prepared are we for the next disaster?',
        metrics: [
            { id: 'rainy_day_fund_pct',        view: 't'  },
            { id: 'road_poor_pct',             view: 'rh' },
            { id: 'broadband_subscription_pct', view: 'rh' },
            { id: 'renewables_share_gen',       view: 't'  },
        ],
    },
    {
        id: 'civic',
        title: 'Why is voter turnout so low?',
        metrics: [
            { id: 'voter_participation_rate', view: 'rh' },
        ],
    },
    {
        id: 'leaving',
        title: 'Are more people leaving or coming?',
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
