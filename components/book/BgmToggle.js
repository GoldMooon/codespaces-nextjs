import { useEffect, useRef, useState } from 'react'
import { AmbientPlayer } from '../../lib/bgm'
import Button from '../ui/Button'

// 동화책 읽기 화면 전용 배경음악 켜고 끄는 버튼.
// 브라우저 자동재생 정책 때문에 사용자가 직접 눌러야 소리가 시작된다.
export default function BgmToggle({ category }) {
  const playerRef = useRef(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    playerRef.current = new AmbientPlayer()
    return () => {
      playerRef.current?.stop()
    }
  }, [])

  const toggle = () => {
    if (!playerRef.current) return
    if (playing) {
      playerRef.current.stop()
      setPlaying(false)
    } else {
      playerRef.current.start(category)
      setPlaying(true)
    }
  }

  return (
    <Button variant="ghost" size="small" onClick={toggle}>
      {playing ? '🔊 배경음악' : '🔈 배경음악'}
    </Button>
  )
}
