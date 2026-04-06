// ============================================================
// Hawaiʻi Dashboard - Bundle Config
//
// Each bundle is a named, question-first entry point that
// maps to a curated subset of existing metrics and their
// most useful default tab (t = trend, r = rank, rh = rank-history, c = county).
// ============================================================

const BUNDLES = [ // eslint-disable-line no-unused-vars
    {
        id: 'affordability',
        title: 'Affordability',
        description: 'How far paychecks stretch for residents',
        metrics: [
            { id: 'renter_cost_burden_pct',    view: 'rh' },
            { id: 'home_price_to_income',       view: 'rh' },
            { id: 'real_per_capita_income',     view: 'rh' },
            { id: 'residential_price_cpkwh',    view: 't'  },
            { id: 'food_insecurity_rate',        view: 't'  },
            { id: 'net_domestic_migration_rate', view: 't'  },
        ],
    },
    {
        id: 'keeping-residents',
        title: 'Keeping Residents',
        description: "Why people stay or leave Hawaiʻi",
        metrics: [
            { id: 'net_domestic_migration_rate', view: 't'  },
            { id: 'renter_cost_burden_pct',      view: 'rh' },
            { id: 'home_price_to_income',        view: 'rh' },
            { id: 'real_per_capita_income',      view: 'rh' },
            { id: 'unemployment_rate',           view: 'rh' },
            { id: 'labor_force_participation',   view: 't'  },
        ],
    },
    {
        id: 'jobs-and-pay',
        title: 'Jobs & Pay',
        description: 'Employment, wages, and worker output',
        metrics: [
            { id: 'unemployment_rate',         view: 'rh' },
            { id: 'labor_force_participation',  view: 't'  },
            { id: 'real_per_capita_income',     view: 'rh' },
            { id: 'labor_productivity',         view: 't'  },
        ],
    },
    {
        id: 'economic-opportunity',
        title: 'Economic Opportunity',
        description: 'Business formation, growth, and income',
        metrics: [
            { id: 'estabs_entry_rate',          view: 't'  },
            { id: 'net_employer_formation',     view: 'r'  },
            { id: 'labor_productivity',         view: 't'  },
            { id: 'real_per_capita_income',     view: 'rh' },
            { id: 'unemployment_rate',          view: 'rh' },
            { id: 'labor_force_participation',  view: 't'  },
        ],
    },
    {
        id: 'student-outcomes',
        title: 'Student Outcomes',
        description: 'How Hawaiʻi students are doing in school',
        metrics: [
            { id: 'naep_math_8',    view: 'rh' },
            { id: 'naep_reading_8', view: 'rh' },
            { id: 'acgr',           view: 't'  },
        ],
    },
    {
        id: 'public-safety',
        title: 'Public Safety',
        description: 'Crime trends and community security',
        metrics: [
            { id: 'violent_crime_rate',  view: 't'  },
            { id: 'property_crime_rate', view: 'rh' },
        ],
    },
    {
        id: 'health-coverage',
        title: 'Health Coverage & Care',
        description: 'Insurance access and primary care supply',
        metrics: [
            { id: 'uninsured_rate', view: 'rh' },
            { id: 'pcp_per_100k',   view: 'r'  },
        ],
    },
];
