import type { FastifyInstance } from 'fastify'
import { HttpError } from '../util'
import { getDef } from '../engine'
import { need } from './helpers'
import { extractText,mapToFields } from '../ocr'
import { ENTITIES } from '../../shared/entities'

/** Upload any document, read it (OCR where needed) and, when a record type is given, arrange it into that record's fields for review before import. */
export default async function (app: FastifyInstance) {
  app.post('/api/ocr/extract', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    if (!req.user || req.user.party_id) throw new HttpError(403, 'Staff only')
    if (!req.isMultipart()) throw new HttpError(400, 'Upload a file')
    let entity = '', file: { buf: Buffer; name: string; mime: string } | null = null
    for await (const part of req.parts()) {
      if (part.type === 'field') { if (part.fieldname === 'entity') entity = String(part.value ?? ''); continue }
      if (file) { part.file.resume(); continue }
      const buf = await part.toBuffer()
      if (buf.length > 20 * 1024 * 1024) throw new HttpError(400, 'Files can be up to 20 MB')
      file = { buf, name: part.filename || 'document', mime: (part.mimetype || '').split(';')[0]!.toLowerCase() }
    }
    if (!file) throw new HttpError(400, 'No file received')
    if (entity) { if (!ENTITIES[entity]) throw new HttpError(400, 'Unknown record type'); need(req, getDef(entity).module, 'create') }
    let ex
    try { ex = await extractText(file.buf, file.name, file.mime) } catch (e: any) { throw new HttpError(400, e?.message || 'The document could not be read') }
    if (!ex.text) return { ...ex, file: file.name, records: [], by: 'rules', warning: 'No readable text was found in this file.' }
    const mapped = entity ? await mapToFields(ex.text, getDef(entity)) : { records: [], by: 'rules' as const }
    return { ...ex, file: file.name, ...mapped }
  })
}
