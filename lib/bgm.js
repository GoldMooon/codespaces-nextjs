// ===========================================
// 배경음악(BGM) — 저작권 걱정 없는 자체 합성 앰비언트 음악
// ===========================================
// 외부 음원(mp3 등)을 전혀 사용하지 않고, 브라우저 Web Audio API로
// 코드 진행(화음이 바뀌는 것)과 그 위에 얹는 짧은 멜로디를 그때그때 직접
// 합성해 재생한다. 어디서도 가져온 음원이 없으므로 저작권 문제가
// 원천적으로 발생하지 않는다.
//
// 이 파일은 동화책 "읽기 화면"에서만 쓰이며, 텍스트/이미지 생성 로직
// (lib/openai.js, pages/api/books/*)과는 전혀 연결돼 있지 않다. 문제이
// 생기면 이 파일과 components/book/BgmToggle.js만 지우거나, BookViewer.js에서
// <BgmToggle> 사용 부분만 주석 처리하면 다른 기능에 영향 없이 바로 끌 수 있다.

// 음이름 -> 주파수(Hz), 3~4옥타브 위주 (A4=440Hz 평균율 기준)
const N = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, Db4: 277.18, D4: 293.66, E4: 329.63, F4: 349.23, Gb4: 369.99,
  G4: 392.0, A4: 440.0, Bb4: 466.16, B4: 493.88,
}

// 카테고리별 코드 진행(4개 화음이 순서대로 반복) + 음색 — 화음이 계속 바뀌면서
// 곡처럼 흘러가도록 한다(예전엔 화음 1개만 계속 울려서 단조로운 "삐-" 소리처럼 들렸음)
const MOODS = {
  fantasy: { progression: [[N.A3, N.C4, N.E4], [N.F3, N.A3, N.C4], [N.C4, N.E4, N.G4], [N.G3, N.B3, N.D4]], waveform: 'sine' },
  adventure: { progression: [[N.D4, N.Gb4, N.A4], [N.A3, N.Db4, N.E4], [N.B3, N.D4, N.Gb4], [N.G3, N.B3, N.D4]], waveform: 'triangle' },
  animals: { progression: [[N.C4, N.E4, N.G4], [N.G3, N.B3, N.D4], [N.A3, N.C4, N.E4], [N.F3, N.A3, N.C4]], waveform: 'sine' },
  friendship: { progression: [[N.F3, N.A3, N.C4], [N.C4, N.E4, N.G4], [N.D4, N.F4, N.A4], [N.Bb4, N.D4, N.F4]], waveform: 'sine' },
  education: { progression: [[N.C4, N.E4, N.G4], [N.F3, N.A3, N.C4], [N.G3, N.B3, N.D4], [N.C4, N.E4, N.G4]], waveform: 'sine' },
  scifi: { progression: [[N.A3, N.C4, N.E4], [N.E4, N.G4, N.B4], [N.F3, N.A3, N.C4], [N.G3, N.B3, N.D4]], waveform: 'triangle' },
  default: { progression: [[N.C4, N.E4, N.G4], [N.A3, N.C4, N.E4], [N.F3, N.A3, N.C4], [N.G3, N.B3, N.D4]], waveform: 'sine' },
}

const CHORD_DURATION = 6 // 화음 하나가 유지되는 시간(초)
const MELODY_INTERVAL = 900 // 멜로디 음 간격(ms)

export function getMood(category) {
  return MOODS[category] || MOODS.default
}

/**
 * 코드 진행 위에 짧은 멜로디를 얹어 재생하는 은은한 배경음악 플레이어.
 * 화음은 부드럽게 페이드 인/아웃하며 다음 화음으로 넘어가 끊기는 느낌이 없고,
 * 멜로디는 현재 화음의 구성음을 한 옥타브 위에서 톡톡 튕기듯 재생한다.
 */
export class AmbientPlayer {
  constructor() {
    this.ctx = null
    this.masterGain = null
    this.playing = false
    this.timers = []
    this.mood = null
    this.chordIndex = 0
    this.melodyStep = 0
  }

  start(category, volume = 0.05) {
    if (this.playing || typeof window === 'undefined') return
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return // 구형 브라우저는 조용히 무시(치명적이지 않은 기능)

    this.ctx = new AudioCtx()
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = volume
    this.masterGain.connect(this.ctx.destination)

    this.mood = getMood(category)
    this.chordIndex = 0
    this.melodyStep = 0
    this.playing = true

    this._scheduleChord()
    this._scheduleMelodyNote()
  }

  // 화음을 부드럽게 페이드 인 → 유지 → 페이드 아웃시키며, 다음 화음을 살짝
  // 겹치게 예약해 끊김 없이 이어지도록 한다.
  _scheduleChord() {
    if (!this.playing) return
    const startTime = this.ctx.currentTime + 0.05
    const chord = this.mood.progression[this.chordIndex % this.mood.progression.length]
    const dur = CHORD_DURATION

    chord.forEach((freq) => {
      const osc = this.ctx.createOscillator()
      osc.type = this.mood.waveform
      osc.frequency.value = freq

      const gain = this.ctx.createGain()
      const peak = 0.5 / chord.length
      gain.gain.setValueAtTime(0, startTime)
      gain.gain.linearRampToValueAtTime(peak, startTime + 1.8)
      gain.gain.setValueAtTime(peak, startTime + dur - 1.8)
      gain.gain.linearRampToValueAtTime(0, startTime + dur)

      osc.connect(gain)
      gain.connect(this.masterGain)
      osc.start(startTime)
      osc.stop(startTime + dur + 0.1)
    })

    this.chordIndex++
    const timer = setTimeout(() => this._scheduleChord(), (dur - 1) * 1000)
    this.timers.push(timer)
  }

  // 현재 화음의 구성음을 한 옥타브 위에서 순서대로 톡톡 튕기듯 재생해
  // 화음만 깔려있을 때보다 실제 "곡"처럼 들리게 하는 짧은 멜로디 레이어.
  _scheduleMelodyNote() {
    if (!this.playing) return
    const chord = this.mood.progression[Math.max(0, this.chordIndex - 1) % this.mood.progression.length]
    const freq = chord[this.melodyStep % chord.length] * 2
    this.melodyStep++

    const now = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq

    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.04, now + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.75)

    osc.connect(gain)
    gain.connect(this.masterGain)
    osc.start(now)
    osc.stop(now + 0.8)

    const timer = setTimeout(() => this._scheduleMelodyNote(), MELODY_INTERVAL)
    this.timers.push(timer)
  }

  setVolume(volume) {
    if (this.masterGain) this.masterGain.gain.value = volume
  }

  stop() {
    this.playing = false
    this.timers.forEach((t) => clearTimeout(t))
    this.timers = []
    if (this.ctx) {
      this.ctx.close()
      this.ctx = null
    }
    this.masterGain = null
  }
}
