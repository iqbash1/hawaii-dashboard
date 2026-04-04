// ============================================================
// Hawaiʻi Dashboard - Bundle Config
//
// Each bundle is a named, question-first entry point that
// maps to a curated subset of existing metrics and their
// most useful default tab (t = trend, r = rank, rh = rank-history, c = county).
// ============================================================

const BUNDLES = [
    {
        id: 'affordability',
        title: 'Affordability',
        description: 'How hard daily costs hit households',
        metrics: [
            { id: 'renter_cost_burden_pct',   view: 'rh' },
            { id: 'home_price_to_income',      view: 'rh' },
            { id: 'real_per_capita_income',    view: 'rh' },
            { id: 'residential_price_cpkwh',   view: 't'  },
            { id: 'food_insecurity_rate',       view: 't'  },
        ],
    },
    {
        id: 'public-safety',
        title: 'Public safety & health',
        description: 'Crime, coverage, and care access',
        metrics: [
            { id: 'violent_crime_rate',  view: 't'  },
            { id: 'property_crime_rate', view: 'rh' },
            { id: 'suicide_rate',        view: 't'  },
            { id: 'uninsured_rate',      view: 'rh' },
            { id: 'pcp_per_100k',        view: 'r'  },
        ],
    },
    {
        id: 'student-outcomes',
        title: 'Student outcomes',
        description: 'How Hawaiʻi students are doing in school',
        metrics: [
            { id: 'naep_math_8',      view: 'rh' },
            { id: 'naep_reading_8',   view: 'rh' },
            { id: 'acgr',             view: 't'  },
            { id: 'ba_or_higher_pct', view: 'r'  },
        ],
    },
    {
        id: 'economic-opportunity',
        title: 'Economic opportunity',
        description: 'Jobs, income, and business formation',
        metrics: [
            { id: 'unemployment_rate',         view: 'rh' },
            { id: 'labor_force_participation',  view: 't'  },
            { id: 'labor_productivity',         view: 't'  },
            { id: 'estabs_entry_rate',          view: 't'  },
            { id: 'net_employer_formation',     view: 'r'  },
        ],
    },
];
