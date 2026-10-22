# Trackfill: Plugin Inspirations

A running list of the plugins and hardware we're drawing on to rebuild Trackfill's effects and synths. Status: **Idea → Researching → Measuring → Building → Done**. In the app every effect is now a device with a mode switch; inspirations live there under generic mode names.

## How we work

Every effect and synth gets the same treatment: learn why the original sounds great, rebuild those ideas, measure against it, and keep it cheap enough for a phone.

1. **Research.** Manuals, developer blog posts, papers on the hardware, and other people's recreations.
2. **Measure.** You render test signals through the original at a capture list I write (impulses, sweeps, tones, drum loops), with Plugin Doctor or a DAW.
3. **Build.** One effect with modes rather than many effects, so the picker stays small: one Compressor with Opto, FET, VCA and Digital, one EQ with Pultec, API and Surgical, and so on.
4. **Compare automatically.** A test renders the same signals through ours and scores the match: frequency curves, decay per band, harmonics, attack and release timing.
5. **Listen.** A/B on real material until the scores and your ears agree.

**Ground rules.** Generic names in the app (Room, Opto, FET), never a plugin's name, branding or preset names. We study only what the original outputs, never its code.

**CPU tiers** (rough guesses per copy on an iPhone, to be replaced by measured numbers):

| Tier | Cost per copy | Examples | Where it belongs |
| --- | --- | --- | --- |
| Light | under 0.5% | EQ, filter, single-band compressor, clipper | Anywhere, many at once |
| Medium | 0.5–2% | Saturation with oversampling, chorus, delay, multiband | Pads and buses, a handful each |
| Heavy | 2–5% | Reverbs, OTT-style multiband with oversampling | Returns and buses; freeze pads that need one |

## Reverbs

Two reverb effects: Room for real spaces, and Space for the huge and the vintage. Both are Heavy, so they live on the returns.

> **Open question:** should Vintage and Huge be two modes of one Space effect, or two separate effects?

| Effect · mode | Inspired by | What makes it great | Our approach | Status |
| --- | --- | --- | --- | --- |
| Room | [Valhalla Room](https://valhalladsp.com/2011/04/26/valhallaroom-an-overview/) | Separate early and late sections. Three-band decay: [Bass and High Mult](https://valhalladsp.com/?p=781) scale low and high decay against the main time, with adjustable crossovers. Left and right late reverbs that bleed into each other at a set rate. Dozens of slow randomized LFOs, so tails stay smooth without obvious chorus. [Several modes](https://valhalladsp.com/?p=741) with their own density and colour | 16-line network with input diffusion, early-reflection taps, three-band decay filters in the loop and randomized modulation. Tune each mode against your captures | Building: first pass in the app; tuning against captures next |
| Space · Vintage | Valhalla VintageVerb | The grainy, lush colour of 1970s and 80s digital reverbs: limited bandwidth, a low internal sample rate, chorused tails, era-based colour modes | Run the core at a reduced rate with gentle filtering and saturation, plus modulated diffusion. Colour modes switch bandwidth and modulation | Building: first pass in the app; tuning against captures next |
| Space · Huge | Eventide Blackhole | Enormous, near-endless spaces. A Gravity control that can turn the decay inside out into swells. Freeze | Long, very diffuse network. Gravity shapes the build and decay, and a Freeze button holds the tail | Building: first pass in the app; tuning against captures next |
| Plate (my suggestion) | EMT 140, Valhalla Plate | Dense and bright from the first moment, no early echoes. Classic on snares and vocals | Dattorro-style plate: a compact allpass network, cheaper than Room (Medium) | Building: first pass in the app; tuning against captures next |
| Spring (my suggestion, later) | Classic amp and dub springs | The drippy "boing" and metallic chirp | Chains of dispersive allpasses; Medium | Idea |

## Dynamics

One Compressor with four modes, a new Limiter, a new Multiband with an OTT mode, and upgrades to the Clipper and Transient effects we have. Most are Light; oversampling is what makes the distortion-heavy ones Medium.

| Effect · mode | Inspired by | What makes it great | Our approach | Status |
| --- | --- | --- | --- | --- |
| Compressor · Opto | Teletronix LA-2A | The optical cell: slowish attack and a two-stage release (fast at first, then a long tail) that follows the music. Soft knee, gentle ratio, tube colour, only two knobs | Detector feeding a model of the light cell's response, soft knee, light tube saturation on the output | Building: first pass in the app; tuning against captures next |
| Compressor · FET | Urei 1176 | Very fast attack, well under a millisecond. Ratio buttons, including the all-buttons trick that goes aggressive and distorted. FET and transformer colour that grows as you push the input | Fast detector, ratio presets plus an all-buttons mode, saturation that rises with gain reduction | Building: first pass in the app; tuning against captures next |
| Compressor · VCA (my suggestion) | SSL bus compressor | The "glue" on drum buses and mixes: clean VCA, a few fixed ratios, auto release, sidechain high-pass | Feed-forward VCA design, ratio and attack steps, program-dependent auto release | Building: first pass in the app; tuning against captures next |
| Compressor · Digital | Our current compressor | Clean and precise, no colour | Keep it, add optional lookahead | Idea |
| Limiter | FabFilter Pro-L 2 | Transparent loudness: lookahead, true-peak limiting, oversampling, and several styles that trade punch against cleanliness | Lookahead limiter with style presets (attack and release shapes), true-peak detection with oversampling; Medium to Heavy, for the master and buses | Building: first pass in the app; tuning against captures next |
| Multiband · Classic and OTT | Ableton Multiband Dynamics | Three bands, each able to compress and expand both above and below its thresholds. The OTT preset (heavy upward and downward squash) is a staple of EDM sound design | Phase-aligned three-band split; per-band above and below controls; an OTT mode with Depth, Time and output | Building: first pass in the app; tuning against captures next |
| Clipper (upgrade) | StandardCLIP, KClip | Clean, loud peaks with no pumping. Oversampling keeps the clipping from adding harsh aliasing | Add oversampling and a choice of clip curves | Building: first pass in the app; tuning against captures next |
| Transient (upgrade) | SPL Transient Designer | Works the same at any level: shapes attack and sustain without a threshold | Refine our two-envelope design to match its response | Idea |
| Gate (my suggestion) | Drum gates, e.g. Drawmer DS201 | Tightens drums and room tails; can key from another track | Threshold with hysteresis, hold, range, lookahead, optional key input | Building: first pass in the app; tuning against captures next |

## EQ

One EQ with four modes. All are Light; only Surgical's dynamic bands step up to Medium.

| Mode | Inspired by | What makes it great | Our approach | Status |
| --- | --- | --- | --- | --- |
| Pultec | Pultec EQP-1A | Passive curves that can't sound harsh. Boosting and cutting the same low frequency at once gives a big low shelf with a dip just above it (the "Pultec trick"). Broad, silky top boost. Tube makeup colour | Curves fitted to measured responses, including the boost-and-cut interaction; gentle tube saturation | Building: first pass in the app; tuning against captures next |
| API | API 550 | Proportional Q: the band narrows as you boost harder, so small moves stay broad and big ones focused. Stepped frequencies. Punchy colour | Three bands with proportional Q and stepped frequency choices; optional colour | Building: first pass in the app; tuning against captures next |
| Console (my suggestion) | SSL E and G channel EQ | The classic mixing-console EQ for drums and buses: four bands, tight mids, high and low filters | Four bands plus filters, curves matched to the E and G styles | Building: first pass in the app; tuning against captures next |
| Surgical | FabFilter Pro-Q | Precise bands of any shape. Curves stay accurate near the top of the range instead of bunching up. Dynamic bands that only act when a frequency gets loud. Mid/side | Up to 8 bands of any shape with accurate high-frequency curves, optional dynamic bands, mid/side. No linear-phase mode: too costly and it adds latency | Idea |

## Filters

One Filter with circuit modes. The same filter cores go into the synths, so this work pays off twice. Analog models stay Light to Medium; heavy resonance and drive need oversampling.

| Mode | Inspired by | What makes it great | Our approach | Status |
| --- | --- | --- | --- | --- |
| Ladder | Moog transistor ladder | Four-pole, 24 dB/oct. Saturating stages give warmth and drive. Resonance thins the bass and can self-oscillate | Zero-delay-feedback ladder with saturation per stage, an optional bass-compensation switch, oversampling at high resonance | Building: first pass in the app; tuning against captures next |
| Diode (303) | Roland TB-303 | The squelch: a diode ladder whose resonance and slope behave differently from Moog's, and come alive with accent and envelope | Diode-ladder model. Pairs with an accent-aware envelope and slides in the synth and sequencer | Building: first pass in the app; tuning against captures next |
| Screamer | Korg MS-20 | Aggressive, screaming resonance that distorts when pushed, in high-pass and low-pass | Model of the MS-20 style filter with built-in clipping in the feedback | Building: first pass in the app; tuning against captures next |
| State-variable | Oberheim SEM | Smooth 12 dB filter with a knob that morphs low-pass through notch to high-pass | Our current filter core plus a continuous morph control | Building: first pass in the app; tuning against captures next |
| Formant and comb (my suggestion) | Vowel and comb filters in Serum and similar | Talking, vocal and metallic tones; a staple of DnB and neuro bass design | Three-peak vowel filter with morph; tuned comb filter with feedback | Building: first pass in the app; tuning against captures next |
| Clean | Our current filter | Neutral and cheap | Keep as the default mode | Done |

I'd also give the Filter a built-in LFO and envelope follower (auto-wah), as in Soundtoys FilterFreak, so it moves on its own without drawing automation.

## More effects (my suggestions)

These fill the gaps for making full tracks. Most upgrade an effect we already have rather than adding a new one.

| Effect · modes | Inspired by | What makes it great | Our approach | Status |
| --- | --- | --- | --- | --- |
| Saturation · Tube, Tape, Transistor, Console, Fuzz | Soundtoys Decapitator, FabFilter Saturn 2 | Different analog circuits that each add their own harmonics and tone, with a "punish" boost and tone tilt. Saturn adds multiband styles | Modes fitted to measured harmonic curves; oversampling; multiband later. Medium | Building: first pass in the app; tuning against captures next |
| Tape | Classic tape emulations, e.g. Waves J37 | Soft saturation, low-end bump, gentle top roll-off, wow and flutter, hiss | One effect with drive, wear, wow, flutter and noise. Medium | Building: first pass in the app; tuning against captures next |
| Delay · Tape, Analog, Digital, Ping-pong | Soundtoys EchoBoy, Valhalla Delay | Each echo style has its own colour and decay; groove and swing settings; saturation in the feedback | Modes on our delay: filtering, saturation and modulation in the feedback, swing. Medium | Building: first pass in the app; tuning against captures next |
| Chorus · Juno, Dimension | Roland Juno-60 chorus, Roland Dimension D | The lush, wide shimmer of old bucket-brigade chips | Two classic modes on our chorus, with the original LFO rates and filtering. Light | Building: first pass in the app; tuning against captures next |
| Phaser and Flanger | MXR Phase 90, Electro-Harmonix Electric Mistress | Classic swirl and jet sweeps | Phase 90 mode on our phaser; a new flanger with feedback and manual sweep. Light | Building: first pass in the app; tuning against captures next |
| Lo-fi · SP-1200, SP-404 | E-mu SP-1200, Roland SP-404, D16 Decimort | The 12-bit sampler grit behind classic breaks: aliasing, gritty converters, filters | Bitcrush modes that model the converter and filter character. Light | Building: first pass in the app; tuning against captures next |
| Stereo tools | iZotope Ozone Imager, mono-maker utilities | Width by frequency band; bass kept mono below a set frequency | Upgrade Utility with a bass-mono frequency and band width. Light | Building: first pass in the app; tuning against captures next |
| Disperser (your request) | Kilohearts Disperser | Smears a sound's phase around one frequency so transients turn into a "zap" or laser sweep; huge for DnB and neuro basses | A chain of up to 48 allpass stages around a chosen frequency, with Pinch for how tightly they bunch. Light to Medium | Building: first pass in the app; tuning against captures next |
| Performance FX | Image-Line Gross Beat, tape-stop and stutter effects | Tape stops, stutters, half-time and gated chops: big for DnB transitions | A synced effect that slices and replays its own buffer, playable live and by automation. Light to Medium | Idea |

## Scales and chords (Keys view)

Inspired by the MPC's Pad Perform (scale and chord modes), with one big difference: our chords are voiced and played the way a person plays them, and the pads always hold the full set of chords in the key, not just one song's.

| Part | Inspired by | What we built | Status |
| --- | --- | --- | --- |
| Scale mode | MPC Pad Perform scales | 25 scales: the seven major modes, minor colours (harmonic, melodic, Phrygian dominant, Hungarian and more), pentatonics and blues, world and symmetric scales. Root pads lit | Building: first pass in the app |
| Chord mode | MPC Pad Perform chords | Every chord in the key, then borrowed and colour chords (♭VI, ♭VII, iv in major, V7 and Neapolitan in minor, secondary dominants, sus chords) | Building: first pass in the app |
| Voicings | Real piano, guitar and synth playing | Close, Open, Drop 2, Shell, Rootless, Quartal, Piano (two hands), Wide pad, Stab. "Rich" colour picks extensions per chord the way players do (maj9, m9, 13, ♯11 on a Lydian chord, add11 where a 9 would clash) | Building: first pass in the app |
| Feel | How players actually play | Smooth voice leading, strum up, down or alternating, velocity shaping (top note sings), a touch of looseness; recorded exactly as played | Building: first pass in the app |

### Progressions and where they come from

Chord progressions aren't owned by songs, but naming them after songs in the app would be confusing, so they're named by feel. These are the sources.

| In the app | Chords (in the key) | Comes from |
| --- | --- | --- |
| Liquid roll | i – ♭VI – ♭III – ♭VII | "Zombie" (The Cranberries); a staple of liquid DnB and trance |
| Night drive | i – ♭VII – ♭VI – v – iv – ♭III – ♭VI – V | Liquid DnB minor walk-downs (idiom) |
| Dark stairs | i – ♭II – ♭vii – i | Phrygian darkness in neuro and dubstep (idiom) |
| Deep stabs | i9 – iv9 – ♭VImaj9 – v7 | Deep house and UK garage minor-9th stabs (idiom) |
| Two of a kind | ♭VImaj7 – V7 – i7 – ♭vii7 – ♭III7 | "Just the Two of Us" (Grover Washington Jr. and Bill Withers) |
| Moonlit vamp | i7 – IV9 | "Oye Como Va" (Tito Puente, Santana) and Dorian funk vamps |
| Lucky groove | i7 – ♭III – v7 – IV | "Get Lucky" (Daft Punk) |
| Pedal pulse | i – ii/i – ♭III/i – ii/i | "Billie Jean" (Michael Jackson): chords over one held bass note |
| Hit the road | i – ♭VII – ♭VI – V | The Andalusian cadence: "Hit the Road Jack" (Ray Charles) |
| Sweet dark | i – ♭VI – V | "Sweet Dreams (Are Made of This)" (Eurythmics) |
| Time lapse | i – v – ♭VII – IV | "Time" (Hans Zimmer, Inception) |
| Watchtower | i – ♭VII – ♭VI – ♭VII | "All Along the Watchtower" (Bob Dylan, Jimi Hendrix) |
| Autumn circle | iv – ♭VII – ♭III – ♭VI – iiø – V – i | The minor circle of fifths: "Autumn Leaves", "Fly Me to the Moon" |
| Minor two-five | iiø – V7♭9 – i | Jazz minor ii–V–i (idiom) |
| Modal drift | i – ♭ii (quartal) | "So What" (Miles Davis) |
| Anthem | I – V – vi – IV | "Let It Be" (The Beatles), "Don't Stop Believin'" (Journey) |
| Heartbreak | vi – IV – I – V | "Despacito", countless pop and EDM drops |
| Golden oldie | I – vi – IV – V | "Stand by Me" (Ben E. King) and doo-wop |
| Royal road | IVmaj7 – V – iii7 – vi | The J-pop "royal road", a future bass favourite |
| Canon | I – V – vi – iii – IV – I – IV – V | Pachelbel's Canon in D |
| Gospel lift | I – iii – IV – ♯iv° – I/5 – vi – ii – V | Gospel and church walk-ups (idiom) |
| Beach bossa | Imaj7 – II7 – ii7 – ♭II7 | "The Girl from Ipanema" (Jobim) |
| Turnaround | I – VI7 – ii – V | Rhythm changes and jazz turnarounds (idiom) |
| Backdoor home | IV – iv – ♭VII7 – I | The backdoor resolution in neo-soul and jazz (idiom) |
| Outsider | I – III – IV – iv | "Creep" (Radiohead) |
| Clockwork | I – v – ii | "Clocks" (Coldplay) |
| Coda | I – ♭VII – IV – I | The "Hey Jude" coda (The Beatles) |
| Sunrise | vi – IV – I – V | Trance and progressive house breakdowns (idiom) |

"Idiom" means a common way of playing rather than one song. Ideas for more are welcome: any song you love, I can work out its progression and voicing.

## Synths

Your ideas go first; the rows below are mine to compare against. Each synth plays from a pad like a sound, with up to 8 voices, and shares the filter cores above.

**Your ideas**

- (add yours here)

| Synth | Inspired by | What makes it great | Our approach | Status |
| --- | --- | --- | --- | --- |
| Analog | Minimoog, Juno, Prophet | Two or three rich oscillators into a great filter, with snappy envelopes. Covers subs, Reeses, leads and pads | Alias-free oscillators, Ladder and State-variable filters, two envelopes, LFOs, unison detune. Light to Medium per voice | Idea |
| Supersaw and Hoover | Roland JP-8000, Alpha Juno hoover | Seven detuned saws for huge leads; the pitch-dipping, pulse-width-swept hoover that defines rave and DnB | A Supersaw oscillator mode in Analog, plus a Hoover preset built on it | Idea |
| Wavetable | Xfer Serum | Scanning wavetables, warp modes (bend, FM, sync, mirror) and unison: the workhorse for modern DnB and neuro basses | Wavetable oscillators with position, warp and unison; tables built in and importable. Medium to Heavy with unison | Idea |
| FM | Yamaha DX7, Ableton Operator | Metallic, glassy and growling tones from a few sine operators; very cheap to run | Four-operator FM with ratios, feedback and envelopes per operator. Light | Idea |
| Acid | Roland TB-303 | One oscillator into the diode filter, with accent and slide in the pattern doing most of the work | Small mono synth using the Diode filter; accent and slide added to note data | Idea |
| Drum synth | Roland 808 and 909, Sonic Charge Microtonic | Kicks, snares and hats you can tune and shape instead of sampling | Two-layer voice (tone plus noise) with pitch and amp envelopes. Light | Idea |

## Suggested order

Start with the measuring tools, then the cheap effects every track uses, then filters (which unlock synths), and the heavy reverbs last.

1. **Measurement harness and capture lists.** Everything after this gets scored against the originals.
2. **Compressor modes and Limiter.** Used on every track, Light, and they set up the master chain.
3. **EQ modes.**
4. **Filter modes.** They feed straight into the synths.
5. **Multiband with OTT.**
6. **Room reverb, then Space.**
7. **Synths:** Analog first (it reuses the filters), then FM, Acid and Drum, then Wavetable.
8. **The other upgrades** (saturation, delay, chorus, lo-fi, performance FX) fit in between, whenever a track needs them.
