import { Document, Page, Text } from '@react-pdf/renderer'
import type { Application, Harvest, Units } from '@/lib/types'
import type { FieldRow } from '@/lib/fields'

interface Props {
  field: FieldRow
  farmName: string
  units: Units
  mapImage?: Buffer | null
  recentHarvests?: Harvest[]
  recentApplications?: Application[]
}

// MINIMAL — debugging React error #31 from renderToBuffer.
export function FieldPrintDocument({ field, farmName }: Props) {
  return (
    <Document>
      <Page size="LETTER">
        <Text>{farmName} — {field.name}</Text>
      </Page>
    </Document>
  )
}
