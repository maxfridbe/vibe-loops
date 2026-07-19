#!/bin/bash
# Assembles the starter loop collection into assets/loops/ and writes
# assets/loops.tsv metadata. Two sources:
#   1. CC0 loops from the Sonic Pi built-in sample collection (downloaded,
#      flac -> mp3).
#   2. Loops synthesized from scratch with ffmpeg expression filters
#      (CC0 by construction).
# Results are committed to the repo; this script only needs re-running to
# regenerate or extend the collection. Requires: curl, ffmpeg, ffprobe.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=assets/loops
TSV=assets/loops.tsv
SP_BASE="https://raw.githubusercontent.com/sonic-pi-net/sonic-pi/dev/etc/samples"
SP_SRC="https://github.com/sonic-pi-net/sonic-pi/tree/dev/etc/samples"
MP3_OPTS=(-codec:a libmp3lame -b:a 192k -ar 44100)

mkdir -p "$OUT"
printf 'file\tname\tcategory\tbpm\tbeats\tkey\tlicense\tsource\n' > "$TSV"

row() { # file name category bpm beats key license source
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$@" >> "$TSV"
}

# ---------------------------------------------------------------------------
# 1. Sonic Pi CC0 loops.  beats chosen (power of two) so that
#    bpm = beats * 60 / duration lands in a musical range.
# ---------------------------------------------------------------------------
sp_loop() { # sample-name display-name category beats key
  local sample=$1 name=$2 category=$3 beats=$4 key=$5
  local flac mp3 dur bpm
  flac=$(mktemp --suffix=.flac)
  mp3="$OUT/$sample.mp3"
  echo "downloading $sample"
  curl -fsSL "$SP_BASE/$sample.flac" -o "$flac"
  ffmpeg -y -loglevel error -i "$flac" "${MP3_OPTS[@]}" "$mp3"
  dur=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$flac")
  bpm=$(awk "BEGIN{printf \"%.2f\", $beats*60/$dur}")
  rm -f "$flac"
  row "$sample.mp3" "$name" "$category" "$bpm" "$beats" "$key" "CC0" "$SP_SRC"
}

sp_loop loop_amen       "Amen Break"       drums    4  ""
sp_loop loop_breakbeat  "Breakbeat"        drums    4  ""
sp_loop loop_compus     "Compus"           drums    16 ""
sp_loop loop_industrial "Industrial"       drums    2  ""
sp_loop loop_mika       "Mika"             drums    16 ""
sp_loop loop_safari     "Safari"           drums    16 ""
sp_loop loop_tabla      "Tabla"            drums    16 ""
sp_loop loop_perc1      "Perc One"         perc     4  ""
sp_loop loop_perc2      "Perc Two"         perc     4  ""
sp_loop loop_electric   "Electric"         melodic  4  ""
sp_loop loop_garzul     "Garzul"           melodic  16 ""
sp_loop loop_weirdo     "Weirdo"           fx       8  ""

# ---------------------------------------------------------------------------
# 2. Synthesized loops (ffmpeg aevalsrc).  CC0 by construction.
# ---------------------------------------------------------------------------

# Builds a nested-if expression choosing a frequency by step index in ld(0).
freq_chain() { # freq...
  local i=0 expr="" close=""
  local freqs=("$@")
  local last=$(( ${#freqs[@]} - 1 ))
  for f in "${freqs[@]}"; do
    if [ "$i" -eq "$last" ]; then
      expr+="$f"
    else
      expr+="if(eq(ld(0)\\,$i)\\,$f\\,"
      close+=")"
    fi
    i=$((i+1))
  done
  printf '%s%s' "$expr" "$close"
}

synth() { # file duration filtergraph
  echo "synthesizing $1"
  ffmpeg -y -loglevel error -f lavfi -i "$3" -t "$2" "${MP3_OPTS[@]}" "$OUT/$1"
}

# Bass: 120 BPM, 8 beats (4 s), 16 eighth-note steps, A minor.
BASS_FREQS=(55 55 110 55 65.41 65.41 49 49 55 55 110 55 82.41 82.41 73.42 73.42)
BASS_IF=$(freq_chain "${BASS_FREQS[@]}")
synth synth_bass.mp3 4 "aevalsrc=exprs='st(0\\,floor(mod(t\\,4)/0.25))*0+min(mod(t\\,0.25)*200\\,1)*exp(-6*mod(t\\,0.25))*0.7*(sin(2*PI*($BASS_IF)*t)+0.3*sin(2*PI*($BASS_IF)*2*t))':s=44100,lowpass=f=500"

# Arp: 128 BPM, 8 beats (3.75 s), sixteenth notes cycling A3 C4 E4 A4.
ARP_STEP=0.1171875
ARP_IF=$(freq_chain 220 261.63 329.63 440)
synth synth_arp.mp3 3.75 "aevalsrc=exprs='st(0\\,mod(floor(t/$ARP_STEP)\\,4))*0+min(mod(t\\,$ARP_STEP)*300\\,1)*exp(-14*mod(t\\,$ARP_STEP))*0.6*(sin(2*PI*($ARP_IF)*t)+0.4*sin(2*PI*($ARP_IF)*0.5*t))':s=44100"

# Pad: 90 BPM, 8 beats (5.3333 s), Am -> F, whole-loop fade envelope.
PAD_DUR=5.333333
PAD_A="sin(2*PI*220*t)+sin(2*PI*220.7*t)+sin(2*PI*261.63*t)+sin(2*PI*329.63*t)+sin(2*PI*330.6*t)"
PAD_F="sin(2*PI*174.61*t)+sin(2*PI*175.2*t)+sin(2*PI*220*t)+sin(2*PI*261.63*t)+sin(2*PI*262.4*t)"
synth synth_pad.mp3 "$PAD_DUR" "aevalsrc=exprs='0.14*sin(PI*mod(t\\,$PAD_DUR)/$PAD_DUR)*if(lt(mod(t\\,$PAD_DUR)\\,2.666667)\\,$PAD_A\\,$PAD_F)':s=44100,lowpass=f=2200"

# Hats: 140 BPM, 8 beats (3.4286 s), sixteenth-note noise bursts, accented.
HAT_STEP=0.107142857
synth synth_hats.mp3 3.428571 "aevalsrc=exprs='(random(0)-0.5)*1.5*exp(-45*mod(t\\,$HAT_STEP))*if(eq(mod(floor(t/$HAT_STEP)\\,4)\\,0)\\,1\\,0.55)':s=44100,highpass=f=6500"

row synth_bass.mp3 "Pulse Bass"  bass    120 8 "Am" "CC0" "synthesized"
row synth_arp.mp3  "Cascade Arp" melodic 128 8 "Am" "CC0" "synthesized"
row synth_pad.mp3  "Drift Pad"   pads    90  8 "Am" "CC0" "synthesized"
row synth_hats.mp3 "Tick Hats"   perc    140 8 ""   "CC0" "synthesized"

# ---------------------------------------------------------------------------
# Batch 2: five more Sonic Pi CC0 loops + fifteen more synthesized loops.
# ---------------------------------------------------------------------------

sp_loop loop_amen_full  "Amen Full"    drums 16 ""
sp_loop loop_3d_printer "Printer"      fx    16 ""
sp_loop loop_drone_g_97 "Drone G"      pads  8  "G"
sp_loop loop_mehackit1  "Mehackit One" melodic 4 ""
sp_loop loop_mehackit2  "Mehackit Two" melodic 4 ""

# Like freq_chain, but used for per-step amplitude gate tables.
amp_chain() { freq_chain "$@"; }

# Night Bass: 100 BPM, 8 beats (4.8 s), eighth notes, E minor.
NB_IF=$(freq_chain 41.2 41.2 61.74 41.2 49 49 41.2 41.2 41.2 41.2 61.74 41.2 36.71 36.71 41.2 41.2)
synth synth_bass_em.mp3 4.8 "aevalsrc=exprs='st(0\\,floor(mod(t\\,4.8)/0.3))*0+min(mod(t\\,0.3)*200\\,1)*exp(-5*mod(t\\,0.3))*0.7*(sin(2*PI*($NB_IF)*t)+0.35*sin(2*PI*($NB_IF)*2*t))':s=44100,lowpass=f=450"

# Acid Line: 130 BPM, 8 beats (3.6923 s), sixteenth notes, A minor.
AC_STEP=0.11538461
AC_IF=$(freq_chain 55 110 55 82.41 55 110 65.41 55 55 110 55 82.41 98 82.41 65.41 61.74)
synth synth_bass_acid.mp3 3.692307 "aevalsrc=exprs='st(0\\,mod(floor(t/$AC_STEP)\\,16))*0+min(mod(t\\,$AC_STEP)*300\\,1)*exp(-9*mod(t\\,$AC_STEP))*0.55*(sin(2*PI*($AC_IF)*t)+0.45*sin(2*PI*($AC_IF)*3*t)+0.25*sin(2*PI*($AC_IF)*5*t))':s=44100,lowpass=f=900"

# Sub Pulse: 140 BPM, 8 beats (3.4286 s), half-note subs in F.
synth synth_bass_sub.mp3 3.428571 "aevalsrc=exprs='min(mod(t\\,0.857142)*60\\,1)*exp(-1.2*mod(t\\,0.857142))*0.85*sin(2*PI*43.65*t)':s=44100,lowpass=f=160"

# Sunrise Arp: 110 BPM, 8 beats (4.3636 s), eighth notes, C major.
SA_STEP=0.27272727
SA_IF=$(freq_chain 261.63 329.63 392 523.25)
synth synth_arp_maj.mp3 4.363636 "aevalsrc=exprs='st(0\\,mod(floor(t/$SA_STEP)\\,4))*0+min(mod(t\\,$SA_STEP)*250\\,1)*exp(-7*mod(t\\,$SA_STEP))*0.55*(sin(2*PI*($SA_IF)*t)+0.3*sin(2*PI*($SA_IF)*0.5*t))':s=44100"

# Hyper Arp: 150 BPM, 8 beats (3.2 s), sixteenth notes, D minor.
HA_STEP=0.1
HA_IF=$(freq_chain 293.66 349.23 440 587.33)
synth synth_arp_fast.mp3 3.2 "aevalsrc=exprs='st(0\\,mod(floor(t/$HA_STEP)\\,4))*0+min(mod(t\\,$HA_STEP)*350\\,1)*exp(-12*mod(t\\,$HA_STEP))*0.55*(sin(2*PI*($HA_IF)*t)+0.35*sin(2*PI*($HA_IF)*2*t))':s=44100"

# Chip Lead: 120 BPM, 8 beats (4 s), quarter-note melody, C major.
CL_IF=$(freq_chain 523.25 493.88 440 392 440 493.88 523.25 587.33)
synth synth_lead_chip.mp3 4 "aevalsrc=exprs='st(0\\,floor(mod(t\\,4)/0.5))*0+min(mod(t\\,0.5)*120\\,1)*exp(-1.8*mod(t\\,0.5))*0.4*(sin(2*PI*($CL_IF)*t)+0.33*sin(2*PI*($CL_IF)*3*t)+0.2*sin(2*PI*($CL_IF)*5*t))':s=44100,lowpass=f=6000"

# Bell Line: 90 BPM, 8 beats (5.3333 s), half-note FM bells, A minor.
BL_IF=$(freq_chain 440 523.25 659.26 783.99)
synth synth_bell.mp3 5.333333 "aevalsrc=exprs='st(0\\,mod(floor(t/1.333333)\\,4))*0+st(1\\,mod(t\\,1.333333))*0+exp(-2.2*ld(1))*0.5*sin(2*PI*($BL_IF)*ld(1)+2.2*exp(-3*ld(1))*sin(2*PI*($BL_IF)*3.53*ld(1)))':s=44100"

# Golden Pad: 80 BPM, 8 beats (6 s), C major chord swell.
GP="sin(2*PI*261.63*t)+sin(2*PI*262.5*t)+sin(2*PI*329.63*t)+sin(2*PI*392*t)+sin(2*PI*393.2*t)"
synth synth_pad_maj.mp3 6 "aevalsrc=exprs='0.13*sin(PI*mod(t\\,6)/6)*($GP)':s=44100,lowpass=f=2600"

# Umbra Pad: 70 BPM, 8 beats (6.8571 s), low D minor chord.
UP="sin(2*PI*146.83*t)+sin(2*PI*147.4*t)+sin(2*PI*174.61*t)+sin(2*PI*220*t)+sin(2*PI*220.9*t)"
synth synth_pad_dark.mp3 6.857142 "aevalsrc=exprs='0.13*sin(PI*mod(t\\,6.857142)/6.857142)*($UP)':s=44100,lowpass=f=1400"

# Four Floor: 128 BPM, 8 beats (3.75 s), kick on every beat.
FF_STEP=0.46875
synth synth_kick_four.mp3 3.75 "aevalsrc=exprs='st(1\\,mod(t\\,$FF_STEP))*0+exp(-9*ld(1))*0.9*sin(2*PI*(48*ld(1)+(120/22)*(1-exp(-22*ld(1)))))+(random(0)-0.5)*0.2*exp(-90*ld(1))':s=44100,lowpass=f=3000"

# Kick Pattern: 100 BPM, 8 beats (4.8 s), syncopated eighth-note kicks.
KP_GATE=$(amp_chain 1 0 0 1 0 0 1 0 1 0 0 1 0 1 0 0)
KP_STEP=0.3
synth synth_kick_break.mp3 4.8 "aevalsrc=exprs='st(0\\,mod(floor(t/$KP_STEP)\\,16))*0+st(1\\,mod(t\\,$KP_STEP))*0+($KP_GATE)*(exp(-9*ld(1))*0.9*sin(2*PI*(46*ld(1)+(110/20)*(1-exp(-20*ld(1)))))+(random(0)-0.5)*0.18*exp(-90*ld(1)))':s=44100,lowpass=f=2800"

# Clap Track: 120 BPM, 8 beats (4 s), triple-burst claps on beats 2 and 4.
synth synth_clap.mp3 4 "aevalsrc=exprs='st(1\\,mod(t+1\\,2))*0+(random(0)-0.5)*1.4*(exp(-55*ld(1))+0.7*exp(-55*abs(ld(1)-0.018))*gte(ld(1)\\,0.018)+0.5*exp(-55*abs(ld(1)-0.038))*gte(ld(1)\\,0.038))':s=44100,highpass=f=900,lowpass=f=7500"

# Offbeat Hats: 128 BPM, 8 beats (3.75 s), hats on the offbeats.
OH_STEP=0.46875
synth synth_hats_off.mp3 3.75 "aevalsrc=exprs='st(1\\,mod(t+$OH_STEP/2\\,$OH_STEP))*0+(random(0)-0.5)*1.3*exp(-35*ld(1))':s=44100,highpass=f=7000"

# Tom Groove: 110 BPM, 8 beats (4.3636 s), descending tom pattern.
TG_IF=$(freq_chain 180 0.001 150 150 0.001 120 100 0.001 180 0.001 150 120 0.001 100 90 90)
TG_STEP=0.27272727
synth synth_toms.mp3 4.363636 "aevalsrc=exprs='st(0\\,mod(floor(t/$TG_STEP)\\,16))*0+st(1\\,mod(t\\,$TG_STEP))*0+gt(($TG_IF)\\,1)*exp(-7*ld(1))*0.8*sin(2*PI*($TG_IF)*(ld(1)-0.2*ld(1)*ld(1)))':s=44100,lowpass=f=1200"

# Lift FX: 120 BPM, 16 beats (8 s), chirp riser with noise swell.
synth synth_riser.mp3 8 "aevalsrc=exprs='st(1\\,mod(t\\,8))*0+(ld(1)/8)*(0.35*sin(2*PI*(180*ld(1)+110*ld(1)*ld(1)))+(random(0)-0.5)*0.5)':s=44100,highpass=f=150"

row synth_bass_em.mp3   "Night Bass"   bass    100 8  "Em" "CC0" "synthesized"
row synth_bass_acid.mp3 "Acid Line"    bass    130 8  "Am" "CC0" "synthesized"
row synth_bass_sub.mp3  "Sub Pulse"    bass    140 8  "F"  "CC0" "synthesized"
row synth_arp_maj.mp3   "Sunrise Arp"  melodic 110 8  "C"  "CC0" "synthesized"
row synth_arp_fast.mp3  "Hyper Arp"    melodic 150 8  "Dm" "CC0" "synthesized"
row synth_lead_chip.mp3 "Chip Lead"    melodic 120 8  "C"  "CC0" "synthesized"
row synth_bell.mp3      "Bell Line"    melodic 90  8  "Am" "CC0" "synthesized"
row synth_pad_maj.mp3   "Golden Pad"   pads    80  8  "C"  "CC0" "synthesized"
row synth_pad_dark.mp3  "Umbra Pad"    pads    70  8  "Dm" "CC0" "synthesized"
row synth_kick_four.mp3 "Four Floor"   drums   128 8  ""   "CC0" "synthesized"
row synth_kick_break.mp3 "Kick Pattern" drums  100 8  ""   "CC0" "synthesized"
row synth_clap.mp3      "Clap Track"   perc    120 8  ""   "CC0" "synthesized"
row synth_hats_off.mp3  "Offbeat Hats" perc    128 8  ""   "CC0" "synthesized"
row synth_toms.mp3      "Tom Groove"   perc    110 8  ""   "CC0" "synthesized"
row synth_riser.mp3     "Lift FX"      fx      120 16 ""   "CC0" "synthesized"

echo "done: $(ls "$OUT" | wc -l) loops in $OUT"
