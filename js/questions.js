// ============================================================
// Hawaiʻi Dashboard - Question of the Day bank
//
// 54 questions, rotated deterministically by day index
// starting from QOTD_DAY_ZERO (see js/qotd.js).
//
// Fields:
//   id          stable ID (q001-q100); URL is /q/{id}/
//   slug        URL-friendly handle (used for the OG image filename at
//                 /assets/og/q/{slug}.png: the slug-based redirect page
//                 pattern was dropped May 2026 in favor of id-based URLs)
//   claim       the daily claim shown to the user
//   correct     true | false: the answer
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
      "slug": "hawaii-has-lower-health-uninsured-rate-than-most-states",
      "claim": "Hawaiʻi has a lower health uninsured rate than most states.",
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
      "topic": "Affordability",
      "variant": "V1"
  },
  {
      "id": "q017",
      "slug": "hawaii-has-lower-unemployment-than-the-rest-of-the-country",
      "claim": "Hawaiʻi has lower unemployment than most states.",
      "correct": true,
      "answer": "In 2025, Hawaiʻi was 2.3% versus the median of 4.0%.",
      "chartUrl": "/r/unemployment_rate/",
      "metric": "unemployment_rate",
      "metricLabel": "Unemployment Rate",
      "topic": "Economy & Workforce",
      "variant": "V2"
  },
  {
      "id": "q050",
      "slug": "hawaii-has-higher-electricity-prices-than-the-rest-of-the-country",
      "claim": "Hawaiʻi has higher residential electricity prices than the rest of the country.",
      "correct": true,
      "answer": "In 2025, Hawaiʻi was 40.6¢ versus the median of 15.3¢.",
      "chartUrl": "/r/residential_price_cpkwh/",
      "metric": "residential_price_cpkwh",
      "metricLabel": "Residential Electricity Price",
      "topic": "Affordability",
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
      "topic": "Infrastructure & Trust",
      "variant": "V1"
  },
  {
      "id": "q058",
      "slug": "hawaii-has-more-roads-in-poor-condition-than-the-rest-of-the-country",
      "claim": "More of Hawaiʻi's roads are in poor condition than in most states.",
      "correct": true,
      "answer": "In 2024, Hawaiʻi was 15.4% versus the median of 6.5%.",
      "chartUrl": "/r/road_poor_pct/",
      "metric": "road_poor_pct",
      "metricLabel": "Roads in Poor Condition",
      "topic": "Infrastructure & Trust",
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
      "topic": "Infrastructure & Trust",
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
      "topic": "Affordability",
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
      "topic": "Affordability",
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
      "topic": "Affordability",
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
      "topic": "Affordability",
      "variant": "V4"
  },
  {
      "id": "q018",
      "slug": "hawaii-is-in-the-top-10-states-for-low-unemployment",
      "claim": "Hawaiʻi is in the top 10 states for low unemployment.",
      "correct": true,
      "answer": "Hawaiʻi ranks #2 of 50 in 2025.",
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
      "answer": "In 2024, Hawaiʻi was 230.5 per 100K versus the median of 327.8 per 100K.",
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
      "answer": "In 2024, Hawaiʻi was 2052.6 per 100K versus the median of 1687.0 per 100K.",
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
      "topic": "Affordability",
      "variant": "V4"
  },
  {
      "id": "q059",
      "slug": "hawaii-is-among-the-states-with-the-most-poor-roads",
      "claim": "Hawaiʻi is among the states with the most poor roads.",
      "correct": true,
      "answer": "Hawaiʻi has the #4 highest value among 50 states in 2024 (15.4%).",
      "chartUrl": "/r/road_poor_pct/",
      "metric": "road_poor_pct",
      "metricLabel": "Roads in Poor Condition",
      "topic": "Infrastructure & Trust",
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
      "topic": "Infrastructure & Trust",
      "variant": "V5"
  },
  {
      "id": "q078",
      "slug": "hawaii-is-among-the-states-with-the-highest-unsheltered-homelessness-rates",
      "claim": "Hawaiʻi is among the states with the highest unsheltered homelessness rates.",
      "correct": true,
      "answer": "Hawaiʻi has the #3 highest value among 50 states in 2024 (28.2 per 10K).",
      "chartUrl": "/r/unsheltered_homeless_rate/",
      "metric": "unsheltered_homeless_rate",
      "metricLabel": "Homelessness",
      "topic": "Affordability",
      "variant": "V4"
  },
  {
      "id": "q003",
      "slug": "smaller-share-of-hawaii-residents-lack-health-insurance-than-california",
      "claim": "A smaller share of Hawaiʻi residents lack health insurance than in California.",
      "correct": true,
      "answer": "In 2024, 3.5% of Hawaiʻi residents lacked health insurance, versus 5.9% of Californians.",
      "chartUrl": "/t/uninsured_rate/ca/",
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
      "topic": "Affordability",
      "variant": "V1"
  },
  {
      "id": "q011",
      "slug": "it-has-gotten-harder-to-afford-a-home-in-hawaii-in-the-last-five-years",
      "claim": "It has gotten harder to afford a home in Hawaiʻi in the last five years.",
      "correct": true,
      "answer": "Hawaiʻi's home price-to-income ratio went from 8.1x to 8.7x between 2019 and 2024 (+8.0%).",
      "chartUrl": "/t/home_price_to_income/",
      "metric": "home_price_to_income",
      "metricLabel": "Home Price-to-Income Ratio",
      "topic": "Affordability",
      "variant": "V6"
  },
  {
      "id": "q019",
      "slug": "unemployment-has-gone-down-in-hawaii-in-the-last-five-years",
      "claim": "Unemployment has gone down in Hawaiʻi in the last five years.",
      "correct": false,
      "answer": "Hawaiʻi's unemployment rate went from 2.5% to 2.8% between 2019 and 2024 (+10.4%).",
      "chartUrl": "/t/unemployment_rate/",
      "metric": "unemployment_rate",
      "metricLabel": "Unemployment Rate",
      "topic": "Economy & Workforce",
      "variant": "V6"
  },
  {
      "id": "q037",
      "slug": "hawaii-is-in-the-top-10-states-for-low-violent-crime",
      "claim": "Hawaiʻi is among the top-ranked states for low violent crime.",
      "correct": true,
      "answer": "Hawaiʻi ranks #12 of 50 in 2024, in the top quartile.",
      "chartUrl": "/r/violent_crime_rate/",
      "metric": "violent_crime_rate",
      "metricLabel": "Violent Crime Rate",
      "topic": "Safety & Health",
      "variant": "V3"
  },
  {
      "id": "q047",
      "slug": "hawaii-has-more-primary-care-doctors-per-resident-than-most-states",
      "claim": "Hawaiʻi has more primary care doctors per resident than most states.",
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
      "answer": "Hawaiʻi's residential electricity price went from 30.3¢ to 40.6¢ per kWh between 2020 and 2025 (+34.0%).",
      "chartUrl": "/t/residential_price_cpkwh/",
      "metric": "residential_price_cpkwh",
      "metricLabel": "Residential Electricity Price",
      "topic": "Affordability",
      "variant": "V6"
  },
  {
      "id": "q056",
      "slug": "renewable-electricity-has-gone-up-in-hawaii-in-the-last-five-years",
      "claim": "Hawaiʻi gets more electricity from renewables today than five years ago.",
      "correct": true,
      "answer": "Hawaiʻi's renewable share of electricity went from 15.9% to 22.1% between 2020 and 2025 (+38.9%).",
      "chartUrl": "/t/renewables_share_gen/",
      "metric": "renewables_share_gen",
      "metricLabel": "Electricity from Renewables",
      "topic": "Infrastructure & Trust",
      "variant": "V6"
  },
  {
      "id": "q060",
      "slug": "poor-road-conditions-have-gone-down-in-hawaii-in-the-last-five-years",
      "claim": "Hawaiʻi has fewer roads in poor condition than it did five years ago.",
      "correct": true,
      "answer": "Hawaiʻi's share of poor-condition roads went from 24.3% to 21.6% between 2018 and 2023 (-11.0%).",
      "chartUrl": "/t/road_poor_pct/",
      "metric": "road_poor_pct",
      "metricLabel": "Roads in Poor Condition",
      "topic": "Infrastructure & Trust",
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
      "topic": "Infrastructure & Trust",
      "variant": "V1"
  },
  {
      "id": "q079",
      "slug": "unsheltered-homelessness-has-gone-down-in-hawaii-in-the-last-five-years",
      "claim": "Unsheltered homelessness has gone down in Hawaiʻi in the last five years.",
      "correct": false,
      "answer": "Hawaiʻi's unsheltered homelessness rate went from 25.7 to 28.2 per 10K between 2019 and 2024 (+9.5%).",
      "chartUrl": "/t/unsheltered_homeless_rate/",
      "metric": "unsheltered_homeless_rate",
      "metricLabel": "Homelessness",
      "topic": "Affordability",
      "variant": "V6"
  },
  {
      "id": "q083",
      "slug": "food-insecurity-has-gone-down-in-hawaii-in-the-last-five-years",
      "claim": "Food insecurity has gone down in Hawaiʻi in the last five years.",
      "correct": false,
      "answer": "Hawaiʻi's food insecurity rate went from 8.0% to 10.8% between the 2016-2018 and 2022-2024 windows (+36.1%).",
      "chartUrl": "/t/food_insecurity_rate/",
      "metric": "food_insecurity_rate",
      "metricLabel": "Food Insecurity Rate",
      "topic": "Affordability",
      "variant": "V6"
  },
  {
      "id": "q099",
      "slug": "more-hawaii-residents-have-college-degrees-than-five-years-ago",
      "claim": "More Hawaiʻi residents have college degrees than five years ago.",
      "correct": true,
      "answer": "Hawaiʻi's share of adults with a bachelor's degree went from 33.6% to 37.8% between 2019 and 2024 (+12.3%).",
      "chartUrl": "/t/ba_or_higher_pct/",
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
      "id": "q012",
      "slug": "of-all-counties-maui-is-the-hardest-place-to-afford-a-home",
      "claim": "Of all counties, Maui is the hardest place to afford a home.",
      "correct": true,
      "answer": "In 2023, the county with the highest value was Maui at 11.2x.",
      "chartUrl": "/c/home_price_to_income/",
      "metric": "home_price_to_income",
      "metricLabel": "Home Price-to-Income Ratio",
      "topic": "Affordability",
      "variant": "V8"
  },
  {
      "id": "q015",
      "slug": "home-internet-access-has-gone-up-in-hawaii-in-the-last-five-years",
      "claim": "Home internet access has gone up in Hawaiʻi in the last five years.",
      "correct": true,
      "answer": "Hawaiʻi's home broadband subscription rate went from 88.0% to 93.0% between 2019 and 2024 (+5.7%).",
      "chartUrl": "/t/broadband_subscription_pct/",
      "metric": "broadband_subscription_pct",
      "metricLabel": "Households with Broadband",
      "topic": "Infrastructure & Trust",
      "variant": "V6"
  },
  {
      "id": "q020",
      "slug": "hawaii-has-lower-unemployment-than-california",
      "claim": "Hawaiʻi has lower unemployment than California.",
      "correct": true,
      "answer": "In 2025, Hawaiʻi was 2.3% versus California at 5.5%.",
      "chartUrl": "/t/unemployment_rate/ca/",
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
      "answer": "Hawaiʻi's violent crime rate went from 285.5 to 230.5 per 100K between 2019 and 2024 (-19.3%).",
      "chartUrl": "/t/violent_crime_rate/",
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
      "answer": "Hawaiʻi's property crime rate went from 2841.2 to 1946.8 per 100K between 2019 and 2024 (-31.5%).",
      "chartUrl": "/t/property_crime_rate/",
      "metric": "property_crime_rate",
      "metricLabel": "Property Crime Rate",
      "topic": "Safety & Health",
      "variant": "V6"
  },
  {
      "id": "q048",
      "slug": "hawaii-is-in-the-top-10-states-for-primary-care-doctors-per-resident",
      "claim": "Hawaiʻi ranks among the top 10 states for primary care doctors as a share of population.",
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
      "chartUrl": "/t/residential_price_cpkwh/ca/",
      "metric": "residential_price_cpkwh",
      "metricLabel": "Residential Electricity Price",
      "topic": "Affordability",
      "variant": "V7"
  },
  {
      "id": "q057",
      "slug": "hawaii-gets-more-renewable-electricity-than-florida",
      "claim": "Hawaiʻi gets a larger share of its electricity from renewables than Florida does.",
      "correct": true,
      "answer": "In 2025, Hawaiʻi was 22.1% versus Florida at 10.6%.",
      "chartUrl": "/t/renewables_share_gen/fl/",
      "metric": "renewables_share_gen",
      "metricLabel": "Electricity from Renewables",
      "topic": "Infrastructure & Trust",
      "variant": "V7"
  },
  {
      "id": "q061",
      "slug": "hawaii-has-more-poor-roads-than-california",
      "claim": "More of Hawaiʻi's roads are in poor condition than California's.",
      "correct": false,
      "answer": "In 2024, Hawaiʻi was 15.4% versus California at 17.6%.",
      "chartUrl": "/t/road_poor_pct/ca/",
      "metric": "road_poor_pct",
      "metricLabel": "Roads in Poor Condition",
      "topic": "Infrastructure & Trust",
      "variant": "V7"
  },
  {
      "id": "q065",
      "slug": "of-all-counties-honolulu-is-losing-the-fewest-residents",
      "claim": "Of all counties, Honolulu is losing the fewest residents to migration.",
      "correct": false,
      "answer": "In 2024, Hawaiʻi County was the only county gaining residents at +29.9 per 10K; Honolulu lost 69.1 per 10K.",
      "chartUrl": "/c/net_domestic_migration_rate/",
      "metric": "net_domestic_migration_rate",
      "metricLabel": "Net Migration",
      "topic": "Infrastructure & Trust",
      "variant": "V8"
  },
  {
      "id": "q072",
      "slug": "hawaii-has-lower-voter-participation-than-california",
      "claim": "Hawaiʻi has lower voter turnout than California.",
      "correct": true,
      "answer": "In 2024, Hawaiʻi was 50.3% versus California at 62.3%.",
      "chartUrl": "/t/voter_participation_rate/ca/",
      "metric": "voter_participation_rate",
      "metricLabel": "Voter Participation Rate",
      "topic": "Infrastructure & Trust",
      "variant": "V7"
  },
  {
      "id": "q080",
      "slug": "of-all-hawaii-counties-honolulu-has-the-highest-unsheltered-homelessness-rate",
      "claim": "Among Hawaiʻi counties, Honolulu has the highest unsheltered homelessness rate.",
      "correct": false,
      "answer": "In 2024, the county with the highest value was Kauaʻi at 63.0 per 10K.",
      "chartUrl": "/c/unsheltered_homeless_rate/",
      "metric": "unsheltered_homeless_rate",
      "metricLabel": "Homelessness",
      "topic": "Affordability",
      "variant": "V8"
  },
  {
      "id": "q084",
      "slug": "hawaii-has-lower-food-insecurity-rate-than-texas",
      "claim": "Hawaiʻi has a lower food insecurity rate than Texas.",
      "correct": true,
      "answer": "In 2022-2024, Hawaiʻi was 10.8% versus Texas at 17.5%.",
      "chartUrl": "/t/food_insecurity_rate/tx/",
      "metric": "food_insecurity_rate",
      "metricLabel": "Food Insecurity Rate",
      "topic": "Affordability",
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
  },
  {
      "id": "q007",
      "slug": "hawaii-uninsured-rate-has-fallen-in-the-last-five-years",
      "claim": "Hawaiʻi's uninsured rate has fallen in the last five years.",
      "correct": true,
      "answer": "Hawaiʻi's uninsured rate went from 4.2% to 3.5% between 2019 and 2024 (-16.7%).",
      "chartUrl": "/t/uninsured_rate/",
      "metric": "uninsured_rate",
      "metricLabel": "Uninsured Rate",
      "topic": "Safety & Health",
      "variant": "V6"
  },
  {
      "id": "q008",
      "slug": "only-one-state-has-higher-health-insurance-coverage-than-hawaii",
      "claim": "Only one other state covers a bigger share of residents with health insurance than Hawaiʻi.",
      "correct": true,
      "answer": "Hawaiʻi has the #2 lowest value among 50 states in 2024 (3.5%).",
      "chartUrl": "/r/uninsured_rate/",
      "metric": "uninsured_rate",
      "metricLabel": "Uninsured Rate",
      "topic": "Safety & Health",
      "variant": "V5"
  },
  {
      "id": "q013",
      "slug": "hawaii-among-states-with-most-cost-burdened-renters",
      "claim": "Few states have a bigger share of cost-burdened renters than Hawaiʻi.",
      "correct": true,
      "answer": "Hawaiʻi has the #4 highest value among 50 states in 2024 (55.0%).",
      "chartUrl": "/r/renter_cost_burden_pct/",
      "metric": "renter_cost_burden_pct",
      "metricLabel": "Renter Housing Cost Burden",
      "topic": "Affordability",
      "variant": "V4"
  },
  {
      "id": "q021",
      "slug": "only-one-state-has-lower-unemployment-than-hawaii",
      "claim": "Only one state has lower unemployment than Hawaiʻi.",
      "correct": true,
      "answer": "Hawaiʻi has the #2 lowest value among 50 states in 2025 (2.3%).",
      "chartUrl": "/r/unemployment_rate/",
      "metric": "unemployment_rate",
      "metricLabel": "Unemployment Rate",
      "topic": "Economy & Workforce",
      "variant": "V5"
  },
  {
      "id": "q022",
      "slug": "of-all-hawaii-counties-maui-has-the-highest-unemployment",
      "claim": "Of all Hawaiʻi counties, Maui has the highest unemployment.",
      "correct": true,
      "answer": "In 2025, the county with the highest value was Maui at 4.3%.",
      "chartUrl": "/c/unemployment_rate/",
      "metric": "unemployment_rate",
      "metricLabel": "Unemployment Rate",
      "topic": "Economy & Workforce",
      "variant": "V8"
  },
  {
      "id": "q063",
      "slug": "hawaii-loses-bigger-share-of-residents-to-rest-of-country-than-any-other-state",
      "claim": "Hawaiʻi loses a bigger share of its residents to the rest of the country than any other state.",
      "correct": true,
      "answer": "In 2024, Hawaiʻi had a net loss of 64.6 residents per 10,000 to the rest of the country, the largest of any state.",
      "chartUrl": "/r/net_domestic_migration_rate/",
      "metric": "net_domestic_migration_rate",
      "metricLabel": "Net Migration",
      "topic": "Infrastructure & Trust",
      "variant": "V5"
  },
  {
      "id": "q073",
      "slug": "voter-turnout-has-gone-down-in-hawaii-in-the-last-five-years",
      "claim": "Voter turnout has gone down in Hawaiʻi in the last five years.",
      "correct": true,
      "answer": "Hawaiʻi's voter participation rate went from 55.4% to 50.3% between 2020 and 2024 (-9.2%).",
      "chartUrl": "/t/voter_participation_rate/",
      "metric": "voter_participation_rate",
      "metricLabel": "Voter Participation Rate",
      "topic": "Infrastructure & Trust",
      "variant": "V6"
  }
];

// Dual export: browser global + Node.js module (for unit tests)
if (typeof module !== "undefined") module.exports = QOTD_QUESTIONS;
