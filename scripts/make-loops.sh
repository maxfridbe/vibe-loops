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

echo "done: $(ls "$OUT" | wc -l) loops in $OUT"
