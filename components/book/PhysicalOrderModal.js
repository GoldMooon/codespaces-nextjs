import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { trackEvent } from '../../lib/analytics'
import { getPhysicalTier } from '../../lib/pricingTiers'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'

export default function PhysicalOrderModal({ book, isOpen, onClose }) {
  const pageCount = book?.content?.pages?.length || book?.page_count || 0
  const tier = getPhysicalTier(pageCount)
  const priceKrw = tier?.price || 0
  const [form, setForm] = useState({
    recipientName: '',
    recipientPhone: '',
    postalCode: '',
    address1: '',
    address2: '',
    memo: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!form.recipientName.trim() || !form.recipientPhone.trim() || !form.postalCode.trim() || !form.address1.trim()) {
      setError('수령인, 연락처, 우편번호, 주소는 필수입니다.')
      return
    }

    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('로그인이 필요합니다.')
        return
      }

      const response = await fetch('/api/payment/physical-order/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ bookId: book.id, ...form }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || '주문 생성에 실패했습니다.')
      }

      trackEvent('begin_checkout', { product_type: 'physical_book', value: priceKrw, currency: 'KRW' })
      window.location.href = data.checkoutUrl
    } catch (err) {
      console.error('Physical order error:', err)
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🎁 실물 책으로 받기" size="medium">
      <p style={{ color: '#64748b', fontSize: 14, marginTop: 0, marginBottom: 20 }}>
        고화질 스퀘어북(하드커버, 243×248mm)으로 인쇄되어 배송됩니다. 가격: <strong>₩{priceKrw.toLocaleString()}</strong> ({tier?.label}, 배송비 포함)
      </p>

      <form onSubmit={handleSubmit}>
        <Input label="수령인" required value={form.recipientName} onChange={update('recipientName')} placeholder="홍길동" />
        <Input label="연락처" required value={form.recipientPhone} onChange={update('recipientPhone')} placeholder="010-0000-0000" />
        <Input label="우편번호" required value={form.postalCode} onChange={update('postalCode')} placeholder="06101" />
        <Input label="주소" required value={form.address1} onChange={update('address1')} placeholder="서울시 강남구 테헤란로 123" />
        <Input label="상세주소" value={form.address2} onChange={update('address2')} placeholder="4층 401호" />
        <Input label="배송 메모 (선택)" value={form.memo} onChange={update('memo')} placeholder="부재시 경비실" />

        {error && (
          <p style={{ color: '#ef4444', fontSize: 14, marginTop: 8 }}>{error}</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            취소
          </Button>
          <Button type="submit" variant="primary" loading={submitting} disabled={submitting}>
            결제하고 주문하기
          </Button>
        </div>
      </form>
    </Modal>
  )
}
