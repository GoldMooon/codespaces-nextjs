// ===========================================
// 배경음악(BGM) — 저작권 걱정 없는 자체 합성 앰비언트 음악
// ===========================================
// 외부 음원(mp3 등)을 전혀 사용하지 않고, 브라우저 Web Audio API로
// 코드 진행(화음이 바뀌는 것)과 그 위에 얹는 짧은 멜로디를 그때그때 직접
// 합성해 재생한다. 어디서도 가져온 음원이 없으므로 저작권 문제가
// 원천적으로 발생하지 않는다.
//
// 이 파일은 동화책 "읽기 화면"에서만 쓰이며, 텍스트/이미지 생성 로직
// (lib/openai.js, pages/api/books/*)과는 전혀 연결돼 있지 않다. 문제가
// 생기면 이 파일과 components/book/BgmToggle.js만 지우거나, BookViewer.js에서
// <BgmToggle> 사용 부분만 주석 처리하면 다른 기능에 영향 없이 바로 끌 수 있다.

// 음이름 -> 주파수(Hz), 3~4옥타브 위주 (A4=440Hz 평균율 기준)
const N = {
  Bb3: 233.08, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, Db4: 277.18, D4: 293.66, E4: 329.63, F4: 349.23, Gb4: 369.99,
  G4: 392.0, A4: 440.0, Bb4: 466.16, B4: 493.88, Db5: 554.37,
}

// 카테고리별 분위기 = (a) 코드 진행: 화음 4개가 순서대로 부드럽게 이어지는 화성적
// 배경, (b) scale: 멜로디에 쓰는 7음 온음계, (c) melody: 실제로 "곡"처럼 들리도록
// 미리 작곡해둔 짧은 멜로디 구(스케일 음정 번호 + 리듬) — 예전엔 화음 구성음을
// 기계적으로 순서대로만 튕겨서 곡이라기보다 반복 신호음처럼 들렸다.
// melody의 각 음은 { d: 스케일 음정(0~6, null=쉼표), t: 길이(ms) }.
const MOODS = {
  fantasy: {
    progression: [[N.A3, N.C4, N.E4], [N.F3, N.A3, N.C4], [N.C4, N.E4, N.G4], [N.G3, N.B3, N.D4]],
    scale: [N.A3, N.B3, N.C4, N.D4, N.E4, N.F4, N.G4], // A 자연단음계, 몽환적
    waveform: 'sine',
    melody: [
      { d: 0, t: 900 }, { d: 2, t: 900 }, { d: 4, t: 1200 }, { d: null, t: 500 },
      { d: 3, t: 900 }, { d: 2, t: 900 }, { d: 0, t: 1500 }, { d: null, t: 600 },
    ],
  },
  adventure: {
    progression: [[N.D4, N.Gb4, N.A4], [N.A3, N.Db4, N.E4], [N.B3, N.D4, N.Gb4], [N.G3, N.B3, N.D4]],
    scale: [N.D4, N.E4, N.Gb4, N.G4, N.A4, N.B4, N.Db5], // D 장음계, 밝고 경쾌
    waveform: 'triangle',
    melody: [
      { d: 0, t: 380 }, { d: 2, t: 380 }, { d: 4, t: 380 }, { d: 2, t: 380 },
      { d: 0, t: 380 }, { d: 4, t: 560 }, { d: 5, t: 560 }, { d: 4, t: 760 },
    ],
  },
  animals: {
    progression: [[N.C4, N.E4, N.G4], [N.G3, N.B3, N.D4], [N.A3, N.C4, N.E4], [N.F3, N.A3, N.C4]],
    scale: [N.C4, N.D4, N.E4, N.F4, N.G4, N.A4, N.B4], // C 장음계, 명랑
    waveform: 'sine',
    melody: [
      { d: 0, t: 340 }, { d: 2, t: 340 }, { d: 4, t: 340 }, { d: 2, t: 340 },
      { d: 0, t: 340 }, { d: 4, t: 340 }, { d: 3, t: 340 }, { d: 2, t: 680 },
    ],
  },
  friendship: {
    progression: [[N.F3, N.A3, N.C4], [N.C4, N.E4, N.G4], [N.D4, N.F4, N.A4], [N.Bb4, N.D4, N.F4]],
    scale: [N.F3, N.G3, N.A3, N.Bb3, N.C4, N.D4, N.E4], // F 장음계, 따뜻함
    waveform: 'sine',
    melody: [
      { d: 0, t: 700 }, { d: 1, t: 700 }, { d: 2, t: 900 }, { d: 3, t: 900 },
      { d: 2, t: 700 }, { d: 1, t: 700 }, { d: 0, t: 1200 }, { d: null, t: 500 },
    ],
  },
  education: {
    progression: [[N.C4, N.E4, N.G4], [N.F3, N.A3, N.C4], [N.G3, N.B3, N.D4], [N.C4, N.E4, N.G4]],
    scale: [N.C4, N.D4, N.E4, N.F4, N.G4, N.A4, N.B4], // C 장음계, 차분함(도레미 걸음)
    waveform: 'sine',
    melody: [
      { d: 0, t: 550 }, { d: 1, t: 550 }, { d: 2, t: 550 }, { d: 3, t: 550 },
      { d: 4, t: 800 }, { d: 3, t: 550 }, { d: 2, t: 550 }, { d: 1, t: 550 }, { d: 0, t: 1000 },
    ],
  },
  scifi: {
    progression: [[N.A3, N.C4, N.E4], [N.E4, N.G4, N.B4], [N.F3, N.A3, N.C4], [N.G3, N.B3, N.D4]],
    scale: [N.A3, N.B3, N.C4, N.D4, N.E4, N.F4, N.G4], // A 자연단음계, 넓은 도약 + 쉼표로 신비감
    waveform: 'triangle',
    melody: [
      { d: 0, t: 800 }, { d: null, t: 400 }, { d: 3, t: 800 }, { d: null, t: 400 },
      { d: 5, t: 1000 }, { d: 3, t: 800 }, { d: 0, t: 1200 }, { d: null, t: 500 },
    ],
  },
  default: {
    progression: [[N.C4, N.E4, N.G4], [N.A3, N.C4, N.E4], [N.F3, N.A3, N.C4], [N.G3, N.B3, N.D4]],
    scale: [N.C4, N.D4, N.E4, N.F4, N.G4, N.A4, N.B4],
    waveform: 'sine',
    melody: [
      { d: 0, t: 700 }, { d: 2, t: 700 }, { d: 4, t: 900 }, { d: 2, t: 700 }, { d: 0, t: 1200 }, { d: null, t: 500 },
    ],
  },
}

const CHORD_DURATION = 6 // 화음 하나가 유지되는 시간(초)

export function getMood(category) {
  return MOODS[category] || MOODS.default
}

/**
 * 코드 진행 위에 미리 작곡해둔 짧은 멜로디를 얹어 재생하는 배경음악 플레이어.
 * 화음은 부드럽게 페이드 인/아웃하며 다음 화음으로 넘어가 끊기는 느낌이 없고,
 * 멜로디는 리듬과 셈여림이 있는 고정된 곡조를 계속 반복 연주한다. 화음 진행
 * 주기(6초)와 멜로디 구 길이가 정확히 맞물리지 않아, 매번 살짝 다른 조합으로
 * 들리며 기계적으로 반복되는 느낌이 덜하다.
 */
export class AmbientPlayer {
  constructor() {
    this.ctx = null
    this.masterGain = null
    this.playing = false
    this.timers = []
    this.mood = null
    this.chordIndex = 0
    this.melodyIndex = 0
  }

  start(category, volume = 0.06) {
    if (this.playing || typeof window === 'undefined') return
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return // 구형 브라우저는 조용히 무시(치명적이지 않은 기능)

    this.ctx = new AudioCtx()
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = volume
    this.masterGain.connect(this.ctx.destination)

    this.mood = getMood(category)
    this.chordIndex = 0
    this.melodyIndex = 0
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

  // 미리 작곡해둔 멜로디 구(음정+리듬)를 계속 반복 연주한다. 쉼표(d:null)도
  // 실제 음악처럼 리듬의 일부로 취급해 그 길이만큼 쉬고 다음 음으로 넘어간다.
  _scheduleMelodyNote() {
    if (!this.playing) return
    const phrase = this.mood.melody
    const note = phrase[this.melodyIndex % phrase.length]
    this.melodyIndex++

    if (note.d !== null) {
      const freq = this.mood.scale[note.d % this.mood.scale.length] * 2 // 한 옥타브 위에서 멜로디
      const now = this.ctx.currentTime
      const releaseSec = Math.max(0.3, (note.t / 1000) * 0.9)

      const osc = this.ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq

      const gain = this.ctx.createGain()
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.045, now + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0008, now + releaseSec)

      osc.connect(gain)
      gain.connect(this.masterGain)
      osc.start(now)
      osc.stop(now + releaseSec + 0.05)
    }

    const timer = setTimeout(() => this._scheduleMelodyNote(), note.t)
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
