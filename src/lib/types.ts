// Shared domain types. Mirror the Postgres schema in supabase/migrations/0001_init.sql.

export type Role = 'owner' | 'member'

export type PlanTier = 'free' | 'starter' | 'pro' | 'business' | 'enterprise'

export type Units = 'acres' | 'arpents'

export type CaneState = 'LA' | 'FL'

export type RatoonStage =
  | 'plant_cane'
  | 'first_stubble'
  | 'second_stubble'
  | 'third_stubble'
  | 'fourth_stubble'
  | 'fifth_stubble_plus'
  | 'sixth_stubble_plus'
  | 'fallow'

export type ApplicationType =
  | 'herbicide'
  | 'insecticide'
  | 'fungicide'
  | 'fertilizer'
  | 'ripener'
  | 'pre_harvest_burn'
  | 'post_harvest_burn'
  | 'green_harvest'
  | 'stubble_shave'
  | 'sub_soiling'
  | 'cultivation'
  | 'layby'
  | 'other'

export type ScoutingCategory =
  | 'weed_pressure'
  | 'insect_pressure'
  | 'disease'
  | 'lodging'
  | 'washout'
  | 'gap'
  | 'note'
  | 'other'

export type SubscriptionStatus =
  | 'none'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'

export interface Organization {
  id: string
  name: string
  owner_id: string
  plan_tier: PlanTier
  units_default: Units
  state: CaneState | null
  acre_count_cached: number
  fsa_farm_number: string | null
  county_fips: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_price_id: string | null
  subscription_status: SubscriptionStatus
  current_period_end: string | null
  created_at: string
}

export interface Section {
  id: string
  org_id: string
  name: string
  fsa_tract_number: string | null
  fsa_farm_number: string | null
  notes: string | null
  archived_at: string | null
  created_at: string
}

export interface FieldCycleHistory {
  id: string
  field_id: string
  crop_year: number
  previous_stage: RatoonStage | null
  new_stage: RatoonStage
  created_at: string
}

export interface Membership {
  org_id: string
  user_id: string
  role: Role
  invited_by: string | null
  accepted_at: string | null
  created_at: string
}

export interface Field {
  id: string
  org_id: string
  name: string
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
  acreage_cached: number
  arpents_cached: number
  variety: string | null
  plant_date: string | null
  current_ratoon: RatoonStage | null
  notes: string | null
  section_id: string | null
  archived_at: string | null
  created_at: string
}

export interface Harvest {
  id: string
  field_id: string
  harvest_year: number
  tons_total: number | null
  tons_per_acre: number | null
  notes: string | null
  created_at: string
}

export interface Application {
  id: string
  field_id: string
  applied_at: string
  product: string
  type: ApplicationType
  rate: number | null
  unit: string | null
  wind_direction: string | null
  wind_speed_mph: number | null
  notes: string | null
  applied_by: string | null
  created_at: string
}

export type WindDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'

export interface Ditch {
  id: string
  org_id: string
  geometry: GeoJSON.LineString
  notes: string | null
  archived_at: string | null
  created_at: string
}

export interface ScoutingPin {
  id: string
  field_id: string
  geometry: GeoJSON.Point
  category: ScoutingCategory
  note: string | null
  photo_url: string | null
  created_by: string
  created_at: string
}
