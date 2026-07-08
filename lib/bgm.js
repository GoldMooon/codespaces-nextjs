// ===========================================
// 배경음악(BGM) — 저작권 걱정 없는 자체 합성 앰비언트 사운드
// ===========================================
// 외부 음원(mp3 등)을 전혀 사용하지 않고, 브라우저 Web Audio API로
// 그때그때 직접 화음을 합성해 재생한다. 어디서도 가져온 음원이 없으므로
// 저작권 문제가 원천적으로 발생하지 않는다.
//
// 이 파일은 동화책 "읽기 화면"에서만 쓰이며, 텍스트/이미지 생성 로직
// (lib/openai.js, pages/api/books/*)과는 전혀 연결돼 있지 않다. 문제가
// 생기면 이 파일과 components/book/BgmToggle.js만 지우거나, BookViewer.js에서
// <BgmToggle> 사용 부분만 주석 처리하면 다른 기능에 영향 없이 바로 끌 수 있다.

// 카테고리별 분위기 — 화음 구성음(Hz)과 음색만 다르게 해 은은한 차이를 준다
const MOODS = {
  fantasy: { notes: [220.0, 261.63, 329.63, 440.0], waveform: 'sine' },      // A minor, 몽환적
  adventure: { notes: [293.66, 369.99, 440.0, 587.33], waveform: 'triangle' }, // D major, 조금 더 밝고 경쾌
  animals: { notes: [261.63, 329.63, 392.0, 523.25], waveform: 'sine' },     // C major, 명랑
  friendship: { notes: [349.23, 440.0, 523.25, 698.46], waveform: 'sine' },  // F major, 따뜻함
  education: { notes: [261.63, 329.63, 392.0], waveform: 'sine' },          // C major triad, 차분함
  scifi: { notes: [220.0, 293.66, 329.63, 440.0], waveform: 'triangle' },   // 열린 4도, 은은한 신비감
  default: { notes: [261.63, 329.63, 392.0], waveform: 'sine' },
}

export function getMood(category) {
  return MOODS[category] || MOODS.default
}

/**
 * 몇 개의 오실레이터로 화음을 합성해 끊김 없이(루프 포인트 없이) 재생하는
 * 앰비언트 플레이어. 각 음마다 서로 다른 아주 느린 LFO로 음량을 미세하게
 * 흔들어 "숨쉬는 듯한" 잔잔한 질감을 만든다.
 */
export class AmbientPlayer {
  constructor() {
    this.ctx = null
    this.masterGain = null
    this.voices = []
    this.playing = false
  }

  start(category, volume = 0.12) {
    if (this.playing || typeof window === 'undefined') return
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return // 구형 브라우저는 조용히 무시(치명적이지 않은 기능)

    this.ctx = new AudioCtx()
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = volume
    this.masterGain.connect(this.ctx.destination)

    const mood = getMood(category)
    this.voices = mood.notes.map((freq, i) => {
      const osc = this.ctx.createOscillator()
      osc.type = mood.waveform
      osc.frequency.value = freq

      const gain = this.ctx.createGain()
      gain.gain.value = 1 / mood.notes.length

      const lfo = this.ctx.createOscillator()
      lfo.frequency.value = 0.04 + i * 0.013 // 음마다 다른 속도로 흔들려 기계적으로 반복되는 느낌 방지
      const lfoGain = this.ctx.createGain()
      lfoGain.gain.value = 0.15 / mood.notes.length
      lfo.connect(lfoGain)
      lfoGain.connect(gain.gain)

      osc.connect(gain)
      gain.connect(this.masterGain)
      osc.start()
      lfo.start()

      return { osc, lfo }
    })

    this.playing = true
  }

  setVolume(volume) {
    if (this.masterGain) this.masterGain.gain.value = volume
  }

  stop() {
    this.voices.forEach(({ osc, lfo }) => {
      try {
        osc.stop()
        lfo.stop()
      } catch {
        // 이미 정지된 경우 무시
      }
    })
    this.voices = []
    if (this.ctx) {
      this.ctx.close()
      this.ctx = null
    }
    this.masterGain = null
    this.playing = false
  }
}
