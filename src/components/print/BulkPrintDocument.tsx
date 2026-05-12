import {
  Document,
  Page,
  View,
  Text,
  Image as PDFImage,
  StyleSheet,
} from '@react-pdf/renderer'
import type { FieldRow } from '@/lib/fields'
import type { Application, Harvest, Units } from '@/lib/types'
import { acresToArpents } from '@/lib/units'
import { OPERATION_TYPE_LABEL } from '@/lib/records'

const colors = {
  primary: '#1A3D2E',
  border: '#D9D9D9',
  muted: '#6B6B6B',
}

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 11, fontFamily: 'Helvetica', color: '#222' },
  cover: { padding: 36, fontFamily: 'Helvetica' },
  coverBrand: { fontSize: 10, color: colors.muted, letterSpacing: 1.5, marginBottom: 6, fontFamily: 'Helvetica-Bold' },
  coverTitle: { fontSize: 28, color: colors.primary, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  coverSubtitle: { fontSize: 12, color: colors.muted, marginBottom: 24 },
  coverDivider: { height: 1.5, backgroundColor: colors.primary, marginBottom: 24 },
  coverList: { flexDirection: 'column' },
  coverRow: { flexDirection: 'row', borderBottom: `0.5pt solid ${colors.border}`, paddingVertical: 6 },
  coverRowName: { flex: 2, fontSize: 11, fontFamily: 'Helvetica-Bold', color: colors.primary },
  coverRowMeta: { flex: 3, fontSize: 10, color: '#444' },
  coverFooter: { position: 'absolute', bottom: 24, left: 36, right: 36, fontSize: 8, color: colors.muted, paddingTop: 6, borderTop: `0.5pt solid ${colors.border}`, flexDirection: 'row', justifyContent: 'space-between' },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  brand: { fontSize: 9, color: colors.muted, letterSpacing: 1.5, marginBottom: 2, fontFamily: 'Helvetica-Bold' },
  fieldName: { fontSize: 24, color: colors.primary, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  area: { fontSize: 11, color: colors.muted },
  headerRight: { textAlign: 'right' },
  date: { fontSize: 10, color: colors.muted },
  divider: { height: 1.5, backgroundColor: colors.primary, marginBottom: 14 },

  mapImage: { width: '100%', height: 240, marginBottom: 12, borderRadius: 4, objectFit: 'cover' },
  mapMissing: { width: '100%', height: 240, marginBottom: 12, borderRadius: 4, border: `1pt solid ${colors.border}`, alignItems: 'center', justifyContent: 'center' },
  mapMissingText: { color: colors.muted, fontSize: 10 },

  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12, borderTop: `0.5pt solid ${colors.border}`, borderLeft: `0.5pt solid ${colors.border}` },
  metaCell: { width: '50%', padding: 7, borderBottom: `0.5pt solid ${colors.border}`, borderRight: `0.5pt solid ${colors.border}` },
  metaLabel: { fontSize: 8, color: colors.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2, fontFamily: 'Helvetica-Bold' },
  metaValue: { fontSize: 11, color: '#222' },

  sectionLabel: { fontSize: 9, color: colors.muted, letterSpacing: 1.5, marginBottom: 5, fontFamily: 'Helvetica-Bold', marginTop: 6 },
  table: { borderTop: `0.5pt solid ${colors.border}`, borderLeft: `0.5pt solid ${colors.border}`, marginBottom: 10 },
  tableRow: { flexDirection: 'row' },
  th: { fontSize: 8, color: colors.muted, padding: 5, fontFamily: 'Helvetica-Bold', borderBottom: `0.5pt solid ${colors.border}`, borderRight: `0.5pt solid ${colors.border}`, backgroundColor: '#FAFAFA', textTransform: 'uppercase', letterSpacing: 0.5 },
  td: { fontSize: 10, padding: 5, borderBottom: `0.5pt solid ${colors.border}`, borderRight: `0.5pt solid ${colors.border}` },

  notesBox: { border: `0.75pt solid ${colors.border}`, borderRadius: 4, minHeight: 70, padding: 10, marginBottom: 8 },
  notesPrefilled: { fontSize: 11, lineHeight: 1.5 },

  footer: { position: 'absolute', bottom: 24, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: colors.muted, paddingTop: 6, borderTop: `0.5pt solid ${colors.border}` },
})

const RATOON_LABELS: Record<string, string> = {
  plant_cane: 'Plant cane',
  first_stubble: '1st stubble',
  second_stubble: '2nd stubble',
  third_stubble: '3rd stubble',
  fourth_stubble: '4th stubble',
  fifth_stubble_plus: '5th+ stubble',
  fallow: 'Fallow',
}

export interface BulkFieldData {
  field: FieldRow
  mapImage: Buffer | null
  recentHarvests: Harvest[]
  recentApplications: Application[]
}

interface Props {
  farmName: string
  units: Units
  fields: BulkFieldData[]
}

export function BulkPrintDocument({ farmName, units, fields }: Props) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const totalAcres = fields.reduce((sum, f) => sum + Number(f.field.acreage_cached || 0), 0)
  const primaryTotal =
    units === 'arpents'
      ? `${acresToArpents(totalAcres).toFixed(2)} arp`
      : `${totalAcres.toFixed(2)} ac`
  const altTotal =
    units === 'arpents' ? `${totalAcres.toFixed(2)} ac` : `${acresToArpents(totalAcres).toFixed(2)} arp`

  return (
    <Document title={`${farmName} — Fields`} author="Headland">
      {/* Cover page */}
      <Page size="LETTER" style={styles.cover}>
        <Text style={styles.coverBrand}>HEADLAND</Text>
        <Text style={styles.coverTitle}>{farmName}</Text>
        <Text style={styles.coverSubtitle}>
          {fields.length} field{fields.length === 1 ? '' : 's'} · {primaryTotal} · {altTotal} · {today}
        </Text>
        <View style={styles.coverDivider} />
        <View style={styles.coverList}>
          {fields.map(({ field }) => {
            const acres = Number(field.acreage_cached || 0)
            const primary = units === 'arpents' ? `${acresToArpents(acres).toFixed(2)} arp` : `${acres.toFixed(2)} ac`
            const ratoon = field.current_ratoon ? RATOON_LABELS[field.current_ratoon] ?? field.current_ratoon : ''
            return (
              <View style={styles.coverRow} key={field.id}>
                <Text style={styles.coverRowName}>{field.name}</Text>
                <Text style={styles.coverRowMeta}>
                  {primary}
                  {field.variety ? ` · ${field.variety}` : ''}
                  {ratoon ? ` · ${ratoon}` : ''}
                </Text>
              </View>
            )
          })}
        </View>
        <View style={styles.coverFooter} fixed>
          <Text>{farmName}</Text>
          <Text>Headland · headland.farm</Text>
        </View>
      </Page>

      {/* One page per field */}
      {fields.map(({ field, mapImage, recentHarvests, recentApplications }) => {
        const acres = Number(field.acreage_cached || 0)
        const arpents = acresToArpents(acres)
        const primaryArea = units === 'arpents' ? `${arpents.toFixed(2)} arp` : `${acres.toFixed(2)} ac`
        const altArea = units === 'arpents' ? `${acres.toFixed(2)} ac` : `${arpents.toFixed(2)} arp`
        const ratoon = field.current_ratoon ? RATOON_LABELS[field.current_ratoon] ?? field.current_ratoon : '—'
        const variety = field.variety || '—'
        const plantDate = field.plant_date
          ? new Date(field.plant_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
          : '—'
        const gps = `${field.centroid_lat.toFixed(5)}°, ${field.centroid_lng.toFixed(5)}°`

        return (
          <Page size="LETTER" style={styles.page} key={field.id}>
            <View style={styles.header}>
              <View>
                <Text style={styles.brand}>HEADLAND · {farmName.toUpperCase()}</Text>
                <Text style={styles.fieldName}>{field.name}</Text>
                <Text style={styles.area}>{primaryArea} · {altArea}</Text>
              </View>
              <View style={styles.headerRight}>
                <Text style={styles.date}>{today}</Text>
                <Text style={styles.date}>GPS {gps}</Text>
              </View>
            </View>
            <View style={styles.divider} />

            {mapImage ? (
              <PDFImage src={mapImage} style={styles.mapImage} />
            ) : (
              <View style={styles.mapMissing}>
                <Text style={styles.mapMissingText}>Map unavailable</Text>
              </View>
            )}

            <View style={styles.metaGrid}>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>Variety</Text>
                <Text style={styles.metaValue}>{variety}</Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>Cut / ratoon</Text>
                <Text style={styles.metaValue}>{ratoon}</Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>Plant date</Text>
                <Text style={styles.metaValue}>{plantDate}</Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>Acreage</Text>
                <Text style={styles.metaValue}>{primaryArea}</Text>
              </View>
            </View>

            {recentHarvests.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>RECENT HARVESTS</Text>
                <View style={styles.table}>
                  <View style={styles.tableRow}>
                    <Text style={[styles.th, { width: '15%' }]}>Year</Text>
                    <Text style={[styles.th, { width: '20%' }]}>Tons</Text>
                    <Text style={[styles.th, { width: '20%' }]}>T/ac</Text>
                    <Text style={[styles.th, { width: '45%' }]}>Notes</Text>
                  </View>
                  {recentHarvests.slice(0, 5).map((h) => (
                    <View key={h.id} style={styles.tableRow}>
                      <Text style={[styles.td, { width: '15%' }]}>{h.harvest_year}</Text>
                      <Text style={[styles.td, { width: '20%' }]}>{h.tons_total ?? '—'}</Text>
                      <Text style={[styles.td, { width: '20%' }]}>{h.tons_per_acre ?? '—'}</Text>
                      <Text style={[styles.td, { width: '45%' }]}>{h.notes ?? ''}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {recentApplications.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>RECENT OPERATIONS</Text>
                <View style={styles.table}>
                  <View style={styles.tableRow}>
                    <Text style={[styles.th, { width: '18%' }]}>Date</Text>
                    <Text style={[styles.th, { width: '22%' }]}>Type</Text>
                    <Text style={[styles.th, { width: '30%' }]}>Product</Text>
                    <Text style={[styles.th, { width: '15%' }]}>Rate</Text>
                    <Text style={[styles.th, { width: '15%' }]}>Notes</Text>
                  </View>
                  {recentApplications.slice(0, 5).map((a) => (
                    <View key={a.id} style={styles.tableRow}>
                      <Text style={[styles.td, { width: '18%' }]}>{a.applied_at}</Text>
                      <Text style={[styles.td, { width: '22%' }]}>
                        {OPERATION_TYPE_LABEL[a.type] ?? a.type}
                      </Text>
                      <Text style={[styles.td, { width: '30%' }]}>{a.product ?? '—'}</Text>
                      <Text style={[styles.td, { width: '15%' }]}>
                        {a.rate != null ? `${a.rate}${a.unit ? ' ' + a.unit : ''}` : '—'}
                      </Text>
                      <Text style={[styles.td, { width: '15%' }]}>{a.notes ?? ''}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.sectionLabel}>NOTES</Text>
            <View style={styles.notesBox}>
              {field.notes ? <Text style={styles.notesPrefilled}>{field.notes}</Text> : null}
            </View>

            <View style={styles.footer} fixed>
              <Text>{farmName} · {field.name}</Text>
              <Text>Headland · headland.farm</Text>
            </View>
          </Page>
        )
      })}
    </Document>
  )
}
