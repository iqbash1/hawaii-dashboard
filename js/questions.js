// ============================================================
// Hawaiʻi Dashboard - Question of the Day bank
//
// 49 questions, rotated deterministically by day index
// starting from QOTD_DAY_ZERO (see js/qotd.js).
//
// Fields:
//   id          stable ID (q001-q100)
//   slug        URL-friendly slug (used at /q/{slug}/)
//   claim       the daily claim shown to the user
//   correct     true | false — the answer
//   answer      1-sentence proof-from-data sentence shown on reveal
//   chartUrl    exact dashboard chart URL backing the claim
//   metric      dashboard metric slug (for iframe / analytics)
//   metricLabel human-readable metric name (for analytics, OG card)
//   topic       policy area (for rotation variety checks)
//   variant     template variant ID (V1-V8)
// ============================================================

const QOTD_QUESTIONS = [
  {
    "id": "q001",
    "slug": "smaller-share-of-hawaii-residents-lack-health-insurance-than-rest-of-country",
    "claim": "Fewer Hawaiʻi residents lack health insurance than in most states.",
    "correct": true,
    "answer": "In 2024, 3.5% of Hawaiʻi residents lacked health insurance, versus the median of 7.3%.",
    "chartUrl": "/r/uninsured_rate/",
    "metric": "uninsured_rate",
    "metricLabel": "Uninsured Rate",
    "topic": "Safety & Health",
    "variant": "V2"
  },
  {
    "id": "q009",
    "slug": "buying-a-home-in-hawaii-costs-more-compared-to-income-than-rest-of-country",
    "claim": "Buying a home in Hawaiʻi takes more years of a resident's income than in any other state.",
    "correct": true,
    "answer": "In 2024, Hawaiʻi was 8.7x versus the median of 4.2x.",
    "chartUrl": "/r/home_price_to_income/",
    "metric": "home_price_to_income",
    "metricLabel": "Home Price-to-Income Ratio",
    "topic": "Housing & Cost of Living",
    "variant": "V1"
  },
  {
    "id": "q017",
    "slug": "hawaii-has-lower-unemployment-than-the-rest-of-the-country",
    "claim": "Hawaiʻi has lower unemployment than most states.",
    "correct": true,
    "answer": "In 2024, Hawaiʻi was 2.9% versus the median of 3.6%.",
    "chartUrl": "/r/unemployment_rate/",
    "metric": "unemployment_rate",
    "metricLabel": "Unemployment Rate",
    "topic": "Economy & Workforce",
    "variant": "V2"
  },
  {
    "id": "q050",
    "slug": "hawaii-has-higher-electricity-prices-than-the-rest-of-the-country",
    "claim": "Hawaiʻi has higher residential electricity prices than in the rest of the country.",
    "correct": true,
    "answer": "In 2025, Hawaiʻi was 40.6¢ versus the median of 15.3¢.",
    "chartUrl": "/r/residential_price_cpkwh/",
    "metric": "residential_price_cpkwh",
    "metricLabel": "Residential Electricity Price",
    "topic": "Housing & Cost of Living",
    "variant": "V1"
  },
  {
    "id": "q054",
    "slug": "hawaii-gets-more-electricity-from-renewables-than-the-rest-of-the-country",
    "claim": "Hawaiʻi gets more of its electricity from renewables than most states.",
    "correct": true,
    "answer": "In 2025, Hawaiʻi was 22.1% versus the median of 17.9%.",
    "chartUrl": "/r/renewables_share_gen/",
    "metric": "renewables_share_gen",
    "metricLabel": "Electricity from Renewables",
    "topic": "Infrastructure, Resilience & Trust",
    "variant": "V1"
  },
  {
    "id": "q058",
    "slug": "hawaii-has-more-roads-in-poor-condition-than-the-rest-of-the-country",
    "claim": "More of Hawaiʻi's roads are in poor condition than in most states.",
    "correct": true,
    "answer": "In 2023, Hawaiʻi was 21.6% versus the median of 7.1%.",
    "chartUrl": "/r/road_poor_pct/",
    "metric": "road_poor_pct",
    "metricLabel": "Roads in Poor Condition",
    "topic": "Infrastructure, Resilience & Trust",
    "variant": "V1"
  },
  {
    "id": "q069",
    "slug": "hawaii-has-lower-voter-participation-than-the-rest-of-the-country",
    "claim": "Hawaiʻi has lower voter turnout than the rest of the country.",
    "correct": true,
    "answer": "In 2024, Hawaiʻi was 50.3% versus the median of 64.7%.",
    "chartUrl": "/r/voter_participation_rate/",
    "metric": "voter_participation_rate",
    "metricLabel": "Voter Participation Rate",
    "topic": "Infrastructure, Resilience & Trust",
    "variant": "V2"
  },
  {
    "id": "q077",
    "slug": "hawaii-has-lower-unsheltered-homelessness-than-most-states",
    "claim": "Hawaiʻi has a lower rate of unsheltered homelessness than most states.",
    "correct": false,
    "answer": "In 2024, Hawaiʻi was 28.2 per 10K versus the median of 3.5 per 10K.",
    "chartUrl": "/r/unsheltered_homeless_rate/",
    "metric": "unsheltered_homeless_rate",
    "metricLabel": "Homelessness",
    "topic": "Housing & Cost of Living",
    "variant": "V1"
  },
  {
    "id": "q081",
    "slug": "hawaii-has-lower-food-insecurity-than-the-rest-of-the-country",
    "claim": "Fewer Hawaiʻi households are food-insecure than in most states.",
    "correct": true,
    "answer": "In 2022-2024, Hawaiʻi was 10.8% versus the median of 12.5%.",
    "chartUrl": "/r/food_insecurity_rate/",
    "metric": "food_insecurity_rate",
    "metricLabel": "Food Insecurity Rate",
    "topic": "Housing & Cost of Living",
    "variant": "V2"
  },
  {
    "id": "q002",
    "slug": "hawaii-is-among-the-top-ranked-states-for-health-coverage",
    "claim": "Hawaiʻi is among the top-ranked states for health insurance coverage.",
    "correct": true,
    "answer": "Hawaiʻi ranks #2 of 50 in 2024.",
    "chartUrl": "/r/uninsured_rate/",
    "metric": "uninsured_rate",
    "metricLabel": "Uninsured Rate",
    "topic": "Safety & Health",
    "variant": "V3"
  },
  {
    "id": "q005",
    "slug": "most-hawaii-renters-spend-over-30-percent-on-rent",
    "claim": "More Hawaiʻi renter households are cost-burdened than in most states.",
    "correct": true,
    "answer": "In 2024, Hawaiʻi was 55.0% versus the median of 49.4%.",
    "chartUrl": "/r/renter_cost_burden_pct/",
    "metric": "renter_cost_burden_pct",
    "metricLabel": "Renter Housing Cost Burden",
    "topic": "Housing & Cost of Living",
    "variant": "V1"
  },
  {
    "id": "q010",
    "slug": "hawaii-is-the-least-affordable-state-to-buy-a-home",
    "claim": "Hawaiʻi is the least affordable state for an average resident to buy a home.",
    "correct": true,
    "answer": "Hawaiʻi has the #1 highest value among 50 states in 2024 (8.7x).",
    "chartUrl": "/r/home_price_to_income/",
    "metric": "home_price_to_income",
    "metricLabel": "Home Price-to-Income Ratio",
    "topic": "Housing & Cost of Living",
    "variant": "V4"
  },
  {
    "id": "q018",
    "slug": "hawaii-is-in-the-top-10-states-for-low-unemployment",
    "claim": "Hawaiʻi is in the top 10 states for low unemployment.",
    "correct": true,
    "answer": "Hawaiʻi ranks #7 of 50 in 2024.",
    "chartUrl": "/r/unemployment_rate/",
    "metric": "unemployment_rate",
    "metricLabel": "Unemployment Rate",
    "topic": "Economy & Workforce",
    "variant": "V3"
  },
  {
    "id": "q036",
    "slug": "hawaii-has-a-lower-violent-crime-rate-than-the-rest-of-the-country",
    "claim": "Hawaiʻi has a lower violent crime rate than most states.",
    "correct": true,
    "answer": "In 2024, Hawaiʻi was 217.7 per 100K versus the median of 320.2 per 100K.",
    "chartUrl": "/r/violent_crime_rate/",
    "metric": "violent_crime_rate",
    "metricLabel": "Violent Crime Rate",
    "topic": "Safety & Health",
    "variant": "V2"
  },
  {
    "id": "q040",
    "slug": "hawaii-has-a-lower-property-crime-rate-than-the-rest-of-the-country",
    "claim": "Hawaiʻi has a lower property crime rate than the rest of the country.",
    "correct": false,
    "answer": "In 2024, Hawaiʻi was 1946.8 per 100K versus the median of 1627.1 per 100K.",
    "chartUrl": "/r/property_crime_rate/",
    "metric": "property_crime_rate",
    "metricLabel": "Property Crime Rate",
    "topic": "Safety & Health",
    "variant": "V2"
  },
  {
    "id": "q051",
    "slug": "hawaii-is-among-the-states-with-the-highest-electricity-prices",
    "claim": "Hawaiʻi is among the states with the highest residential electricity prices.",
    "correct": true,
    "answer": "Hawaiʻi has the #1 highest value among 50 states in 2025 (40.6¢).",
    "chartUrl": "/r/residential_price_cpkwh/",
    "metric": "residential_price_cpkwh",
    "metricLabel": "Residential Electricity Price",
    "topic": "Housing & Cost of Living",
    "variant": "V4"
  },
  {
    "id": "q059",
    "slug": "hawaii-is-among-the-states-with-the-most-poor-roads",
    "claim": "Hawaiʻi is among the states with the most poor roads.",
    "correct": true,
    "answer": "Hawaiʻi has the #4 highest value among 50 states in 2023 (21.6%).",
    "chartUrl": "/r/road_poor_pct/",
    "metric": "road_poor_pct",
    "metricLabel": "Roads in Poor Condition",
    "topic": "Infrastructure, Resilience & Trust",
    "variant": "V4"
  },
  {
    "id": "q070",
    "slug": "hawaii-is-among-the-states-with-the-lowest-voter-participation",
    "claim": "Hawaiʻi is among the states with the lowest voter turnout.",
    "correct": true,
    "answer": "Hawaiʻi has the #1 lowest value among 50 states in 2024 (50.3%).",
    "chartUrl": "/r/voter_participation_rate/",
    "metric": "voter_participation_rate",
    "metricLabel": "Voter Participation Rate",
    "topic": "Infrastructure, Resilience & Trust",
    "variant": "V5"
  },
  {
    "id": "q078",
    "slug": "hawaii-is-among-the-states-with-the-highest-unsheltered-homelessness",
    "claim": "Hawaiʻi is among the states with the highest unsheltered homelessness.",
    "correct": true,
    "answer": "Hawaiʻi has the #3 highest value among 50 states in 2024 (28.2 per 10K).",
    "chartUrl": "/r/unsheltered_homeless_rate/",
    "metric": "unsheltered_homeless_rate",
    "metricLabel": "Homelessness",
    "topic": "Housing & Cost of Living",
    "variant": "V4"
  },
  {
    "id": "q003",
    "slug": "smaller-share-of-hawaii-residents-lack-health-insurance-than-california",
    "claim": "A smaller share of Hawaiʻi residents lack health insurance than in California.",
    "correct": true,
    "answer": "In 2024, 3.5% of Hawaiʻi residents lacked health insurance, versus 5.9% of Californians.",
    "chartUrl": "/rh/uninsured_rate/ca/",
    "metric": "uninsured_rate",
    "metricLabel": "Uninsured Rate",
    "topic": "Safety & Health",
    "variant": "V7"
  },
  {
    "id": "q006",
    "slug": "hawaii-is-one-of-the-hardest-states-to-afford-rent",
    "claim": "Rent is harder to afford in Hawaiʻi than in most US states.",
    "correct": true,
    "answer": "In 2024, 55.0% of Hawaiʻi renter households spent over 30% of income on rent, versus 49.4% in most states.",
    "chartUrl": "/r/renter_cost_burden_pct/",
    "metric": "renter_cost_burden_pct",
    "metricLabel": "Renter Housing Cost Burden",
    "topic": "Housing & Cost of Living",
    "variant": "V1"
  },
  {
    "id": "q011",
    "slug": "it-has-gotten-harder-to-afford-a-home-in-hawaii-in-the-last-five-years",
    "claim": "It has gotten harder to afford a home in Hawaiʻi in the last five years.",
    "correct": true,
    "answer": "From 2019 to 2024, Hawaiʻi moved from 8.1x to 8.7x (+7.4%).",
    "chartUrl": "/five-year-change/",
    "metric": "home_price_to_income",
    "metricLabel": "Home Price-to-Income Ratio",
    "topic": "Housing & Cost of Living",
    "variant": "V6"
  },
  {
    "id": "q019",
    "slug": "unemployment-has-gone-down-in-hawaii-in-the-last-five-years",
    "claim": "Unemployment has gone down in Hawaiʻi in the last five years.",
    "correct": false,
    "answer": "From 2019 to 2024, Hawaiʻi moved from 2.5% to 2.9% (+17.5%).",
    "chartUrl": "/five-year-change/",
    "metric": "unemployment_rate",
    "metricLabel": "Unemployment Rate",
    "topic": "Economy & Workforce",
    "variant": "V6"
  },
  {
    "id": "q037",
    "slug": "hawaii-is-in-the-top-10-states-for-low-violent-crime",
    "claim": "Hawaiʻi is in the top 10 states for low violent crime.",
    "correct": true,
    "answer": "Hawaiʻi ranks #8 of 50 in 2024.",
    "chartUrl": "/r/violent_crime_rate/",
    "metric": "violent_crime_rate",
    "metricLabel": "Violent Crime Rate",
    "topic": "Safety & Health",
    "variant": "V3"
  },
  {
    "id": "q047",
    "slug": "hawaii-has-more-primary-care-doctors-than-the-rest-of-the-country",
    "claim": "Hawaiʻi has more primary care doctors as a % of residents than in most states.",
    "correct": true,
    "answer": "In 2023, Hawaiʻi was 88.1 per 100K versus the median of 78.7 per 100K.",
    "chartUrl": "/r/pcp_per_100k/",
    "metric": "pcp_per_100k",
    "metricLabel": "Primary Care Physicians (civilian)",
    "topic": "Safety & Health",
    "variant": "V1"
  },
  {
    "id": "q052",
    "slug": "electricity-prices-have-gone-up-in-hawaii-in-the-last-five-years",
    "claim": "Electricity prices have gone up in Hawaiʻi in the last five years.",
    "correct": true,
    "answer": "From 2020 to 2025, Hawaiʻi moved from 30.3¢ to 40.6¢ (+34.0%).",
    "chartUrl": "/five-year-change/",
    "metric": "residential_price_cpkwh",
    "metricLabel": "Residential Electricity Price",
    "topic": "Housing & Cost of Living",
    "variant": "V6"
  },
  {
    "id": "q056",
    "slug": "renewable-electricity-has-gone-up-in-hawaii-in-the-last-five-years",
    "claim": "Hawaiʻi gets more electricity from renewables than five years ago.",
    "correct": true,
    "answer": "From 2020 to 2025, Hawaiʻi moved from 15.9% to 22.1% (+38.9%).",
    "chartUrl": "/five-year-change/",
    "metric": "renewables_share_gen",
    "metricLabel": "Electricity from Renewables",
    "topic": "Infrastructure, Resilience & Trust",
    "variant": "V6"
  },
  {
    "id": "q060",
    "slug": "poor-road-conditions-have-gone-down-in-hawaii-in-the-last-five-years",
    "claim": "Poor road conditions have gone down in Hawaiʻi in the last five years.",
    "correct": true,
    "answer": "From 2018 to 2023, Hawaiʻi moved from 24.3% to 21.6% (-11.0%).",
    "chartUrl": "/five-year-change/",
    "metric": "road_poor_pct",
    "metricLabel": "Roads in Poor Condition",
    "topic": "Infrastructure, Resilience & Trust",
    "variant": "V6"
  },
  {
    "id": "q062",
    "slug": "more-people-move-to-hawaii-than-leave",
    "claim": "More people move to Hawaiʻi than leave.",
    "correct": false,
    "answer": "In 2024, Hawaiʻi was -64.6 per 10K versus the median of 6.2 per 10K.",
    "chartUrl": "/r/net_domestic_migration_rate/",
    "metric": "net_domestic_migration_rate",
    "metricLabel": "Net Migration",
    "topic": "Infrastructure, Resilience & Trust",
    "variant": "V1"
  },
  {
    "id": "q071",
    "slug": "voter-participation-has-gone-up-in-hawaii-in-the-last-five-years",
    "claim": "Voter turnout in Hawaiʻi has dropped since the last presidential election.",
    "correct": true,
    "answer": "From 2020 to 2024, Hawaiʻi moved from 55.7% to 50.3% (-9.7%).",
    "chartUrl": "/five-year-change/",
    "metric": "voter_participation_rate",
    "metricLabel": "Voter Participation Rate",
    "topic": "Infrastructure, Resilience & Trust",
    "variant": "V6"
  },
  {
    "id": "q079",
    "slug": "unsheltered-homelessness-has-gone-down-in-hawaii-in-the-last-five-years",
    "claim": "Unsheltered homelessness has gone down in Hawaiʻi in the last five years.",
    "correct": false,
    "answer": "From 2019 to 2024, Hawaiʻi moved from 25.7 per 10K to 28.2 per 10K (+9.5%).",
    "chartUrl": "/five-year-change/",
    "metric": "unsheltered_homeless_rate",
    "metricLabel": "Homelessness",
    "topic": "Housing & Cost of Living",
    "variant": "V6"
  },
  {
    "id": "q083",
    "slug": "food-insecurity-has-gone-down-in-hawaii-in-the-last-five-years",
    "claim": "Food insecurity has gone down in Hawaiʻi in the last five years.",
    "correct": false,
    "answer": "From 2016-2018 to 2022-2024, Hawaiʻi moved from 8.0% to 10.8% (+36.1%).",
    "chartUrl": "/five-year-change/",
    "metric": "food_insecurity_rate",
    "metricLabel": "Food Insecurity Rate",
    "topic": "Housing & Cost of Living",
    "variant": "V6"
  },
  {
    "id": "q099",
    "slug": "more-hawaii-adults-have-college-degrees-than-five-years-ago",
    "claim": "More Hawaiʻi adults have college degrees than five years ago.",
    "correct": true,
    "answer": "From 2019 to 2024, Hawaiʻi moved from 33.6% to 37.8% (+12.4%).",
    "chartUrl": "/five-year-change/",
    "metric": "ba_or_higher_pct",
    "metricLabel": "Adults with Bachelor's Degree+",
    "topic": "Education",
    "variant": "V6"
  },
  {
    "id": "q004",
    "slug": "of-all-counties-hawaii-county-has-highest-share-without-health-insurance",
    "claim": "Of all counties, Hawaiʻi County has the highest share of uninsured residents.",
    "correct": false,
    "answer": "In 2023, Maui had the highest share of uninsured residents at 4.3%.",
    "chartUrl": "/c/uninsured_rate/",
    "metric": "uninsured_rate",
    "metricLabel": "Uninsured Rate",
    "topic": "Safety & Health",
    "variant": "V8"
  },
  {
    "id": "q007",
    "slug": "more-hawaii-renters-cost-burdened-than-five-years-ago",
    "claim": "More Hawaiʻi renter households are cost-burdened than five years ago.",
    "correct": true,
    "answer": "From 2019 to 2024, Hawaiʻi moved from 53.4% to 55.0% (+2.9%).",
    "chartUrl": "/five-year-change/",
    "metric": "renter_cost_burden_pct",
    "metricLabel": "Renter Housing Cost Burden",
    "topic": "Housing & Cost of Living",
    "variant": "V6"
  },
  {
    "id": "q012",
    "slug": "of-all-counties-maui-is-the-hardest-place-to-afford-a-home",
    "claim": "Of all counties, Maui is the hardest place to afford a home.",
    "correct": true,
    "answer": "In 2023, the county with the highest value was Maui at 11.2x.",
    "chartUrl": "/c/home_price_to_income/",
    "metric": "home_price_to_income",
    "metricLabel": "Home Price-to-Income Ratio",
    "topic": "Housing & Cost of Living",
    "variant": "V8"
  },
  {
    "id": "q015",
    "slug": "home-internet-access-has-gone-up-in-hawaii-in-the-last-five-years",
    "claim": "Home internet access has gone up in Hawaiʻi in the last five years.",
    "correct": true,
    "answer": "From 2019 to 2024, Hawaiʻi moved from 88.0% to 93.1% (+5.8%).",
    "chartUrl": "/five-year-change/",
    "metric": "broadband_subscription_pct",
    "metricLabel": "Households with Broadband",
    "topic": "Infrastructure, Resilience & Trust",
    "variant": "V6"
  },
  {
    "id": "q020",
    "slug": "hawaii-has-lower-unemployment-than-california",
    "claim": "Hawaiʻi has lower unemployment than California.",
    "correct": true,
    "answer": "In 2024, Hawaiʻi was 2.9% versus California at 5.3%.",
    "chartUrl": "/rh/unemployment_rate/ca/",
    "metric": "unemployment_rate",
    "metricLabel": "Unemployment Rate",
    "topic": "Economy & Workforce",
    "variant": "V7"
  },
  {
    "id": "q038",
    "slug": "violent-crime-has-gone-down-in-hawaii-in-the-last-five-years",
    "claim": "Violent crime has gone down in Hawaiʻi in the last five years.",
    "correct": true,
    "answer": "From 2019 to 2024, Hawaiʻi moved from 285.5 per 100K to 217.7 per 100K (-23.8%).",
    "chartUrl": "/five-year-change/",
    "metric": "violent_crime_rate",
    "metricLabel": "Violent Crime Rate",
    "topic": "Safety & Health",
    "variant": "V6"
  },
  {
    "id": "q042",
    "slug": "property-crime-has-gone-down-in-hawaii-in-the-last-five-years",
    "claim": "Property crime has gone down in Hawaiʻi in the last five years.",
    "correct": true,
    "answer": "From 2019 to 2024, Hawaiʻi moved from 2841.2 per 100K to 1946.8 per 100K (-31.5%).",
    "chartUrl": "/five-year-change/",
    "metric": "property_crime_rate",
    "metricLabel": "Property Crime Rate",
    "topic": "Safety & Health",
    "variant": "V6"
  },
  {
    "id": "q048",
    "slug": "hawaii-is-in-the-top-10-states-for-primary-care-doctors",
    "claim": "Hawaiʻi is in the top 10 states for primary care doctors.",
    "correct": true,
    "answer": "Hawaiʻi ranks #8 of 50 in 2023.",
    "chartUrl": "/r/pcp_per_100k/",
    "metric": "pcp_per_100k",
    "metricLabel": "Primary Care Physicians (civilian)",
    "topic": "Safety & Health",
    "variant": "V3"
  },
  {
    "id": "q053",
    "slug": "hawaii-has-higher-electricity-prices-than-california",
    "claim": "Hawaiʻi has higher residential electricity prices than California.",
    "correct": true,
    "answer": "In 2025, Hawaiʻi was 40.6¢ versus California at 32.5¢.",
    "chartUrl": "/rh/residential_price_cpkwh/ca/",
    "metric": "residential_price_cpkwh",
    "metricLabel": "Residential Electricity Price",
    "topic": "Housing & Cost of Living",
    "variant": "V7"
  },
  {
    "id": "q057",
    "slug": "hawaii-gets-more-renewable-electricity-than-florida",
    "claim": "Hawaiʻi gets more of its electricity from renewables than Florida.",
    "correct": true,
    "answer": "In 2025, Hawaiʻi was 22.1% versus Florida at 10.6%.",
    "chartUrl": "/rh/renewables_share_gen/fl/",
    "metric": "renewables_share_gen",
    "metricLabel": "Electricity from Renewables",
    "topic": "Infrastructure, Resilience & Trust",
    "variant": "V7"
  },
  {
    "id": "q061",
    "slug": "hawaii-has-more-poor-roads-than-california",
    "claim": "More of Hawaiʻi's roads are in poor condition than California's.",
    "correct": false,
    "answer": "In 2023, Hawaiʻi was 21.6% versus California at 25.5%.",
    "chartUrl": "/rh/road_poor_pct/ca/",
    "metric": "road_poor_pct",
    "metricLabel": "Roads in Poor Condition",
    "topic": "Infrastructure, Resilience & Trust",
    "variant": "V7"
  },
  {
    "id": "q065",
    "slug": "of-all-counties-honolulu-is-losing-the-fewest-residents",
    "claim": "Of all counties, Honolulu is losing the fewest residents.",
    "correct": false,
    "answer": "In 2024, Hawaiʻi County was the only county gaining residents at +29.9 per 10K; Honolulu lost 69.1 per 10K.",
    "chartUrl": "/c/net_domestic_migration_rate/",
    "metric": "net_domestic_migration_rate",
    "metricLabel": "Net Migration",
    "topic": "Infrastructure, Resilience & Trust",
    "variant": "V8"
  },
  {
    "id": "q072",
    "slug": "hawaii-has-lower-voter-participation-than-california",
    "claim": "Hawaiʻi has lower voter turnout than California.",
    "correct": true,
    "answer": "In 2024, Hawaiʻi was 50.3% versus California at 62.3%.",
    "chartUrl": "/rh/voter_participation_rate/ca/",
    "metric": "voter_participation_rate",
    "metricLabel": "Voter Participation Rate",
    "topic": "Infrastructure, Resilience & Trust",
    "variant": "V7"
  },
  {
    "id": "q080",
    "slug": "of-all-counties-honolulu-has-the-highest-unsheltered-homelessness",
    "claim": "Of all counties, Honolulu has the highest unsheltered homelessness.",
    "correct": false,
    "answer": "In 2024, the county with the highest value was Kauaʻi at 63.0 per 10K.",
    "chartUrl": "/c/unsheltered_homeless_rate/",
    "metric": "unsheltered_homeless_rate",
    "metricLabel": "Homelessness",
    "topic": "Housing & Cost of Living",
    "variant": "V8"
  },
  {
    "id": "q084",
    "slug": "hawaii-has-lower-food-insecurity-than-texas",
    "claim": "Hawaiʻi has lower food insecurity than Texas.",
    "correct": true,
    "answer": "In 2022-2024, Hawaiʻi was 10.8% versus Texas at 17.5%.",
    "chartUrl": "/rh/food_insecurity_rate/tx/",
    "metric": "food_insecurity_rate",
    "metricLabel": "Food Insecurity Rate",
    "topic": "Housing & Cost of Living",
    "variant": "V7"
  },
  {
    "id": "q100",
    "slug": "of-all-counties-honolulu-has-the-most-college-graduates",
    "claim": "Of all counties, Honolulu has the highest share of college graduates.",
    "correct": true,
    "answer": "In 2023, the county with the highest value was Honolulu at 39.6%.",
    "chartUrl": "/c/ba_or_higher_pct/",
    "metric": "ba_or_higher_pct",
    "metricLabel": "Adults with Bachelor's Degree+",
    "topic": "Education",
    "variant": "V8"
  }
];

// Dual export: browser global + Node.js module (for unit tests)
if (typeof module !== "undefined") module.exports = QOTD_QUESTIONS;
