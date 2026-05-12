export const SITE_NAME = 'Headland'
export const SITE_TAGLINE = 'Field mapping & records for sugarcane growers'
export const SITE_DESCRIPTION =
  'Map every acre. Track every ratoon. Scout from the truck. Export for FSA in one click.'

export const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

// US mainland sugarcane = Louisiana parishes + Florida counties (Glades).
// Texas (Rio Grande Valley) lost its last mill in 2024; Hawaii ended in 2016.
export type Region = {
  slug: string
  name: string
  state: 'Louisiana' | 'Florida'
  stateAbbr: 'LA' | 'FL'
  kind: 'parish' | 'county'
  mainTown: string
}

export const SUGARCANE_REGIONS: readonly Region[] = [
  // Louisiana parishes
  { slug: 'iberia-parish-louisiana', name: 'Iberia Parish', state: 'Louisiana', stateAbbr: 'LA', kind: 'parish', mainTown: 'New Iberia' },
  { slug: 'st-mary-parish-louisiana', name: 'St. Mary Parish', state: 'Louisiana', stateAbbr: 'LA', kind: 'parish', mainTown: 'Franklin' },
  { slug: 'assumption-parish-louisiana', name: 'Assumption Parish', state: 'Louisiana', stateAbbr: 'LA', kind: 'parish', mainTown: 'Napoleonville' },
  { slug: 'lafourche-parish-louisiana', name: 'Lafourche Parish', state: 'Louisiana', stateAbbr: 'LA', kind: 'parish', mainTown: 'Thibodaux' },
  { slug: 'terrebonne-parish-louisiana', name: 'Terrebonne Parish', state: 'Louisiana', stateAbbr: 'LA', kind: 'parish', mainTown: 'Houma' },
  { slug: 'st-martin-parish-louisiana', name: 'St. Martin Parish', state: 'Louisiana', stateAbbr: 'LA', kind: 'parish', mainTown: 'St. Martinville' },
  // Florida counties (the Glades)
  { slug: 'palm-beach-county-florida', name: 'Palm Beach County', state: 'Florida', stateAbbr: 'FL', kind: 'county', mainTown: 'Belle Glade' },
  { slug: 'hendry-county-florida', name: 'Hendry County', state: 'Florida', stateAbbr: 'FL', kind: 'county', mainTown: 'Clewiston' },
  { slug: 'glades-county-florida', name: 'Glades County', state: 'Florida', stateAbbr: 'FL', kind: 'county', mainTown: 'Moore Haven' },
  { slug: 'martin-county-florida', name: 'Martin County', state: 'Florida', stateAbbr: 'FL', kind: 'county', mainTown: 'Indiantown' },
  { slug: 'okeechobee-county-florida', name: 'Okeechobee County', state: 'Florida', stateAbbr: 'FL', kind: 'county', mainTown: 'Okeechobee' },
] as const
