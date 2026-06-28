import { createServerSupabase } from '../../../../lib/supabase'
import { generateBookPDF, pdfToBase64 } from '../../../../lib/pdf-generator'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = createServerSupabase()

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const { id } = req.query

    // Fetch book
    const { data: book, error } = await supabase
      .from('books')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !book) {
      return res.status(404).json({ error: 'Book not found' })
    }

    if (book.status !== 'completed') {
      return res.status(400).json({ error: 'Book is not ready' })
    }

    // Generate PDF
    const pdfBytes = await generateBookPDF(book)
    const pdfBase64 = pdfToBase64(pdfBytes)

    // Return as downloadable file
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(book.title)}.pdf"`)
    res.send(Buffer.from(pdfBase64, 'base64'))

  } catch (error) {
    console.error('PDF generation error:', error)
    return res.status(500).json({ error: 'Failed to generate PDF' })
  }
}