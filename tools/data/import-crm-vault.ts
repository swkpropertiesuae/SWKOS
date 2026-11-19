import fs from 'node:fs'
import path from 'node:path'
import { syncSchema } from '../../src/server/schema'
import { seedReference } from '../../src/server/seed'
import { parseAndImportVaultBuffer } from '../../src/server/domain/crm-vault'

async function main() {
  const args = process.argv.slice(2)
  if (!args.length) {
    console.error('Usage: npm run crm:import -- <folder-or-file1> [file2 ...]')
    process.exit(1)
  }

  syncSchema()
  await seedReference()

  const files: string[] = []
  for (const arg of args) {
    const p = path.resolve(arg)
    if (!fs.existsSync(p)) {
      console.warn(`Skipping missing path: ${p}`)
      continue
    }
    const stat = fs.statSync(p)
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(p).sort()) {
        const lower = name.toLowerCase()
        // Prefer Master files when importing a full Drive folder so we don't duplicate work across Agent_*_320 files
        if (lower.startsWith('agent_') && fs.existsSync(path.join(p, 'SWK_6_Agents_1920_Cluster_Closing_Deals_Master.xlsx'))) {
          continue
        }
        if (lower.endsWith('.xlsx') || lower.endsWith('.csv')) {
          files.push(path.join(p, name))
        }
      }
    } else {
      files.push(p)
    }
  }

  let totalProps = 0
  let totalRoutes = 0
  for (const f of files) {
    const buf = fs.readFileSync(f)
    const res = await parseAndImportVaultBuffer(buf, path.basename(f))
    totalProps += res.properties.total
    totalRoutes += res.routes.total
    console.log(`Imported ${path.basename(f)}: ${res.properties.inserted} new / ${res.properties.updated} updated properties; ${res.routes.inserted} new / ${res.routes.updated} updated routes`)
  }
  console.log(`\nDone! Total processed: ${totalProps} properties, ${totalRoutes} route tracker rows.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
