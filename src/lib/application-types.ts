// Client-safe application/field-work vocabulary (label per enum value).
// Shared by the Operations feed, bulk logging, and fly-plan spray logging.
export const APPLICATION_LABELS: Record<string, string> = {
  herbicide: 'Herbicide',
  insecticide: 'Insecticide',
  fungicide: 'Fungicide',
  fertilizer: 'Fertilizer',
  ripener: 'Ripener',
  pre_harvest_burn: 'Pre-harvest burn',
  post_harvest_burn: 'Post-harvest burn',
  green_harvest: 'Green harvest',
  stubble_shave: 'Stubble shave',
  sub_soiling: 'Sub-soiling',
  cultivation: 'Cultivation',
  layby: 'Layby',
}

export const APPLICATION_TYPE_KEYS = Object.keys(APPLICATION_LABELS)
