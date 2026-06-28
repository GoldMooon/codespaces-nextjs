import { createServerSupabase } from '../../../lib/supabase'

export default async function handler(req, res) {
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

    if (req.method === 'GET') {
      const { data: book, error } = await supabase
        .from('books')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()

      if (error || !book) {
        return res.status(404).json({ error: 'Book not found' })
      }

      return res.status(200).json({ book })
    }

    if (req.method === 'DELETE') {
      const { error } = await supabase
        .from('books')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) {
        return res.status(500).json({ error: error.message })
      }

      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })

  } catch (error) {
    console.error('Book detail error:', error)
    return res.status(500).json({ error: 'Failed to process request' })
  }
}