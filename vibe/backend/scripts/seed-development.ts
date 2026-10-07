import 'dotenv/config'

import { closeDrizzleDb, createDrizzleDb } from '../src/db'
import { parseDevelopmentSeedConfig } from './development-seed-config'
import { bootstrapDevelopmentData } from './development-seed'

const config = parseDevelopmentSeedConfig(process.env)
const db = createDrizzleDb(config.databaseUrl)

try {
  const result = await bootstrapDevelopmentData(db, config.accounts)
  console.log(`Seeded development administrator ${result.admin.email}.`)
  console.log(`Seeded development user ${result.user.email}.`)
} finally {
  await closeDrizzleDb(db)
}
