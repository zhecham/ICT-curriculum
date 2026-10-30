#!/usr/bin/env python3
"""Render the nine revision storyboards with actual Manim/Cairo.

Example:
PYTHONPATH=.../manim_runtime python render_manim.py --grade 8

Only animation assets and the manifest are written. The source content is read
without modification. All chapter starts are aligned to actual video frames.
"""

from __future__ import annotations

import argparse
import html
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import textwrap

import numpy as np
from manim import (
    Scene, Text, VGroup, RoundedRectangle, Rectangle, Line, Arrow, Dot,
    FadeIn, FadeOut, Transform, AnimationGroup, config, tempconfig,
    UP, DOWN, LEFT, RIGHT, ORIGIN, linear, smooth,
)


BASE = Path(__file__).resolve().parent
OUT = BASE / "animations"
BG = "#10192c"
PANEL = "#17243a"
PANEL_EDGE = "#2c3a52"
BURGUNDY = "#76283f"
GOLD = "#d8b66e"
WHITE = "#edf2fa"
MUTED = "#a6b0c1"
FALSE = "#ee93a3"
ACCENTS = {7: "#7edcc9", 8: "#89bcff", 9: "#b5a3f7"}
SANS = "DejaVu Sans"
MONO = "DejaVu Sans Mono"
FPS = 15
WIDTH = 1280
HEIGHT = 720


def txt(text, size=22, color=WHITE, width=None, font=SANS, weight="NORMAL"):
    """Use Pango text only; no LaTeX or rasterised slide substitutes."""
    obj = Text(str(text), font=font, font_size=size, color=color,
               weight=weight, disable_ligatures=True)
    if width and obj.width > width:
        obj.scale_to_fit_width(width)
    return obj


def multiline(text, size=20, width=12.0, chars=85, color=WHITE):
    lines = textwrap.wrap(text, width=chars, break_long_words=False,
                          break_on_hyphens=False) or [""]
    group = VGroup(*(txt(line, size, color, width=width) for line in lines))
    group.arrange(DOWN, buff=0.10, aligned_edge=LEFT)
    return group


def panel(width, height, center, stroke=PANEL_EDGE, fill=PANEL):
    return RoundedRectangle(width=width, height=height, corner_radius=0.13,
                            stroke_color=stroke, stroke_width=1.5,
                            fill_color=fill, fill_opacity=1).move_to(center)


def badge(label, center, width=3.65, height=0.63, color=GOLD,
          fill=PANEL, size=20):
    box = panel(width, height, center, color, fill)
    label_obj = txt(label, size, color, width=width - 0.24).move_to(center)
    return VGroup(box, label_obj)


def bit_row(pattern, center, active=(), signed=False, weights=False,
            accent=GOLD, cell=0.44, group_nibbles=False, carry=False):
    """An explicit, fixed-width bit array with optional place values."""
    x, y, _ = center
    gap = 0.035
    total = len(pattern) * cell + (len(pattern) - 1) * gap
    group = VGroup()
    for i, digit in enumerate(pattern):
        px = x - total / 2 + cell / 2 + i * (cell + gap)
        chosen = i in active
        color = accent if chosen else PANEL_EDGE
        bg = BURGUNDY if chosen else BG
        box = RoundedRectangle(width=cell, height=0.57, corner_radius=0.045,
                               stroke_color=color, stroke_width=2 if chosen else 1,
                               fill_color=bg, fill_opacity=1).move_to([px, y, 0])
        digit_obj = txt(digit, 24, WHITE if digit == "1" else MUTED,
                        font=MONO).move_to(box)
        group.add(box, digit_obj)
        if weights:
            value = 2 ** (len(pattern) - i - 1)
            if signed and i == 0:
                value = -value
            group.add(txt(value, 12, accent if chosen else MUTED,
                          width=cell-0.015, font=MONO).move_to([px, y + 0.55, 0]))
    if group_nibbles:
        for start in [0, 4]:
            px = x - total/2 + (start + 2) * cell + (start + 1.5) * gap
            group.add(RoundedRectangle(width=4*cell+3*gap+0.01, height=0.77,
                                       corner_radius=0.06, stroke_color=accent if start == 0 else GOLD,
                                       stroke_width=2, fill_opacity=0)
                      .move_to([px, y, 0]))
    if carry:
        px = x - total/2 - 0.35
        group.add(badge("1", [px, y, 0], width=0.44, height=0.57,
                        color=FALSE, fill=BURGUNDY, size=23))
        group.add(txt("9th bit", 11, FALSE).move_to([px, y-0.55, 0]))
    return group


def variable_card(name, value, center, accent, width=3.4, height=1.55):
    box = panel(width, height, center, accent, BG)
    group = VGroup(box)
    group.add(txt(name, 17, MUTED, font=MONO).move_to(box.get_top()+DOWN*0.30))
    group.add(txt(value, 48, accent, width=width-0.35, font=MONO)
              .move_to(box.get_center()+DOWN*0.17))
    return group


def logic_visual(index, accent):
    x=3.85
    if index == 0:
        return VGroup(
            txt("COMPARE FIRST", 14, MUTED).move_to([x, 1.48, 0]),
            badge("height >= 140", [x, 0.95, 0], color=accent),
            badge("True", [x, 0.23, 0], width=1.6, color=accent, fill=BURGUNDY),
            badge("has_ticket: False", [x, -0.65, 0], color=FALSE))
    if index in (1, 2):
        result = "False" if index == 1 else "True"
        op = "AND" if index == 1 else "OR"
        color = FALSE if index == 1 else accent
        return VGroup(
            badge("True", [x-0.95,1.12,0],width=1.6,color=accent),
            badge("False",[x+0.95,1.12,0],width=1.6,color=FALSE),
            txt(op,30,GOLD).move_to([x,0.36,0]),
            Arrow([x,0.05,0],[x,-0.37,0],buff=0.03,color=GOLD,stroke_width=3),
            badge(result,[x,-0.75,0],width=2.5,height=0.72,color=color,fill=BURGUNDY,size=28))
    if index == 3:
        return VGroup(badge("False",[x,1.1,0],width=2.5,color=FALSE),
                      txt("NOT",30,GOLD).move_to([x,0.35,0]),
                      Arrow([x,0.05,0],[x,-0.35,0],buff=0.03,color=GOLD),
                      badge("True",[x,-0.75,0],width=2.5,height=0.72,color=accent,fill=BURGUNDY,size=28))
    return VGroup(
        badge("True AND True -> True",[x,1.05,0],color=accent,size=18),
        badge("False OR False -> False",[x,0.15,0],color=FALSE,size=18),
        badge("NOT True -> False",[x,-0.75,0],color=FALSE,size=18))


def build_visual(story, index, grade):
    """Concrete objects complement the preserved storyboard text."""
    sid=story["id"]
    a=ACCENTS[grade]
    x=3.85
    if sid == "g7-trace":
        values=["4","7","5","5"]
        g=VGroup(txt("VARIABLE MEMORY",14,MUTED).move_to([x,1.5,0]),
                 variable_card("points",values[index],[x,0.47,0],a))
        if index == 3:
            g.add(badge("Screen: 5",[x,-0.95,0],color=GOLD))
        else:
            g.add(txt(["store 4","replace 4 with 7","replace 7 with 5"][index],
                      17,MUTED,width=3.6).move_to([x,-0.85,0]))
        return g
    if sid == "g7-logic":
        return logic_visual(index,a)
    if sid == "g7-input-update":
        total=["—","8","9","9","9","9"][index]
        g=VGroup(txt("MEMORY",13,MUTED).move_to([x,1.64,0]),
                 badge('name: "Lina"',[x,1.15,0],color=a,size=19),
                 badge("total: "+total,[x,0.40,0],color=GOLD,size=19))
        screen=panel(3.65,1.15,[x,-0.82,0],PANEL_EDGE,BG)
        g.add(screen,txt("SCREEN",10,MUTED).move_to([x-1.37,-0.43,0]))
        if index >= 3:
            g.add(txt("Lina",20,a,font=MONO).move_to([x-1.25,-0.78,0]))
        if index >= 4:
            g.add(txt("9",20,GOLD,font=MONO).move_to([x-1.43,-1.15,0]))
        if index < 3:
            g.add(txt("waiting for print",15,MUTED).move_to([x,-0.9,0]))
        return g
    if sid == "g8-decision-branches":
        if index == 5:
            return VGroup(txt("BOUNDARY CHECKS",14,MUTED).move_to([x,1.55,0]),
                          badge("49 -> Low",[x,0.95,0],color=a),
                          badge("50 -> Middle",[x,0.12,0],color=GOLD),
                          badge("80 -> High",[x,-0.71,0],color=a))
        g=VGroup(txt("score = 65",21,GOLD,font=MONO).move_to([x,1.62,0]))
        labels=["High: score >= 80","Middle: score >= 50","Low: else"]
        for j,label in enumerate(labels):
            active=(index==1 and j==0) or (index in (2,3,4) and j==1)
            col=FALSE if index==1 and j==0 else (a if active else MUTED)
            g.add(badge(label,[x,0.96-j*0.87,0],width=3.6,color=col,
                        fill=BURGUNDY if active else BG,size=17))
        if index:
            ypos=0.96 if index==1 else 0.09
            g.add(Arrow([1.67,ypos,0],[2.02,ypos,0],buff=0.02,color=a,stroke_width=4,
                        max_tip_length_to_length_ratio=0.45))
        return g
    if sid == "g8-linear-search":
        values=[6,14,9,21]
        target=40 if index==4 else 14
        count=[0,1,2,2,4][index]
        g=VGroup(txt(f"TARGET {target}",22,GOLD,font=MONO).move_to([x,1.56,0]))
        for j,value in enumerate(values):
            px=x+(j-1.5)*0.93
            active=(index==1 and j==0) or (index in (2,3) and j==1)
            color=FALSE if index==4 else (a if active else MUTED)
            fill=BURGUNDY if active else BG
            g.add(badge(str(value),[px,0.62,0],width=0.8,height=0.86,
                        color=color,fill=fill,size=28),
                  txt(str(j+1),12,MUTED).move_to([px,1.2,0]))
        if index in (1,2,3):
            px=x+((-1.5) if index==1 else -0.5)*0.93
            g.add(Arrow([px,-0.3,0],[px,0.08,0],buff=0.03,color=a,stroke_width=3))
        g.add(txt(f"Comparisons: {count}",19,WHITE).move_to([x,-0.65,0]),
              txt("Found = "+("TRUE" if index in (2,3) else "FALSE"),18,
                  a if index in (2,3) else MUTED,font=MONO).move_to([x,-1.06,0]))
        return g
    if sid == "g8-selection-translation":
        minutes=31 if index==5 else 30
        charge="5" if index==5 else ("2" if index>=2 else "—")
        g=VGroup(txt(f"minutes = {minutes}",21,GOLD,font=MONO).move_to([x,1.6,0]))
        labels=["condition: "+("—" if index==0 else ("False" if index==5 else "True")),
                "charge: "+charge,
                "output: "+(charge if index>=4 else "—")]
        active=0 if index<=1 else (1 if index in (2,3) else 2)
        for j,label in enumerate(labels):
            g.add(badge(label,[x,0.96-j*0.87,0],width=3.6,
                        color=a if j==active else MUTED,
                        fill=BURGUNDY if j==active else BG,size=20))
        if index==3:
            g.add(txt("else skipped",13,FALSE).move_to([x,-1.32,0]))
        return g
    if sid == "g9-binary-hex":
        pattern="00110110"
        active=[i for i,b in enumerate(pattern) if b=="1"] if index>=1 else []
        g=VGroup(txt("EIGHT BITS",14,MUTED).move_to([x,1.6,0]),
                 bit_row(pattern,[x,0.56,0],active=active,weights=index==1,
                         accent=a,group_nibbles=index>=2))
        if index==1:
            g.add(badge("32 + 16 + 4 + 2 = 54",[x,-0.63,0],color=GOLD,size=18))
        elif index>=2:
            g.add(txt("3" if index>=3 else "0011",28,a,font=MONO)
                  .move_to([x-0.95,-0.32,0]),
                  txt("6" if index>=3 else "0110",28,GOLD,font=MONO)
                  .move_to([x+0.95,-0.32,0]))
            g.add(txt("hexadecimal 36" if index>=3 else "two groups of four",18,
                      MUTED).move_to([x,-0.95,0]))
            if index==4:
                g.add(txt("same value: denary 54",14,WHITE).move_to([x,-1.32,0]))
        else:
            g.add(txt("0s and 1s hold one value",17,MUTED).move_to([x,-0.5,0]))
        return g
    if sid == "g9-twos-complement":
        pattern=["00001100","11110011","11110100","11110100","11110100"][index]
        active=[i for i,b in enumerate(pattern) if b=="1"]
        label=["POSITIVE MAGNITUDE","INVERT ALL BITS","ADD ONE","SIGNED WEIGHTS","SIGNED RESULT"][index]
        g=VGroup(txt(label,14,MUTED,width=3.9).move_to([x,1.6,0]),
                 bit_row(pattern,[x,0.55,0],active=active,weights=index>=3,
                         signed=True,accent=a))
        value="+12" if index==0 else ("inverted" if index==1 else "-12")
        g.add(badge(value,[x,-0.62,0],color=GOLD,size=32 if index!=1 else 21))
        if index>=3:
            g.add(txt("leading 1 has weight -128",15,a,width=3.9)
                  .move_to([x,-1.22,0]))
        return g
    if sid == "g9-add-shift":
        if index in (0,1):
            g=VGroup(txt("ADD FROM THE RIGHT",14,MUTED).move_to([x,1.65,0]),
                     bit_row("00000111",[x,0.88,0],active=[5,6,7] if index else [],accent=a),
                     bit_row("00000001",[x,-0.02,0],active=[7] if index else [],accent=a),
                     Line([2,-0.48,0],[5.75,-0.48,0],color=GOLD,stroke_width=2))
            if index==1:
                g.add(txt("carry 1 to the left",17,GOLD).move_to([x,-1.04,0]),
                      Arrow([5.44,-0.78,0],[4.95,-0.78,0],buff=0.02,color=GOLD,stroke_width=3))
            else:
                g.add(txt("7 + 1",25,GOLD,font=MONO).move_to([x,-1.0,0]))
            return g
        if index==2:
            return VGroup(txt("SUM",14,MUTED).move_to([x,1.55,0]),
                          bit_row("00001000",[x,0.6,0],active=[4],accent=a),
                          badge("8",[x,-0.65,0],color=GOLD,size=36))
        if index in (3,4):
            shifted="00010000" if index==3 else "00000100"
            active=3 if index==3 else 5
            g=VGroup(txt("LEFT SHIFT" if index==3 else "RIGHT SHIFT",14,MUTED)
                     .move_to([x,1.62,0]),
                     bit_row("00001000",[x,0.85,0],active=[4],accent=a),
                     bit_row(shifted,[x,-0.25,0],active=[active],accent=GOLD),
                     txt("8 -> 16" if index==3 else "8 -> 4",21,GOLD,font=MONO)
                     .move_to([x,-1.05,0]))
            start=np.array([x+(4-3.5)*0.475,0.49,0])
            end=np.array([x+(active-3.5)*0.475,0.12,0])
            g.add(Arrow(start,end,buff=0.025,color=a,stroke_width=3))
            return g
        return VGroup(txt("UNSIGNED OVERFLOW",14,FALSE).move_to([x,1.6,0]),
                      bit_row("00000000",[x+0.19,0.56,0],active=[],accent=a,carry=True,cell=0.41),
                      badge("256 > 255",[x,-0.63,0],color=FALSE,fill=BURGUNDY,size=25),
                      txt("the result needs 9 bits",16,MUTED).move_to([x,-1.24,0]))
    raise ValueError(f"No concrete visual for {sid}")


class RevisionAnimation(Scene):
    def __init__(self, story, grade, **kwargs):
        self.story=story
        self.grade=grade
        self.step_duration={4:4.8,5:4.4,6:4.0}[len(story["frames"])]
        self.chapters=[]
        super().__init__(**kwargs)

    def construct(self):
        a=ACCENTS[self.grade]
        self.camera.background_color=BG
        # Stable frame and typography: content moves inside a quiet layout.
        brand=txt(f"GRADE {self.grade}  /  COMPUTER SCIENCE",13,GOLD)
        brand.to_edge(UP,buff=0.26).to_edge(LEFT,buff=0.55)
        title=txt(self.story["title"],31,WHITE,width=12.95,weight="BOLD")
        title.move_to([0,3.09,0]).to_edge(LEFT,buff=0.55)
        rule=Line([-6.57,2.76,0],[6.55,2.76,0],color=BURGUNDY,stroke_width=3)
        left_panel=panel(7.42,3.64,[-2.86,0.35,0])
        right_panel=panel(4.81,3.64,[3.85,0.35,0])
        note_panel=panel(13.12,1.15,[0,-2.33,0],stroke=BURGUNDY,fill="#192237")
        self.add(brand,title,rule,left_panel,right_panel,note_panel)
        count=len(self.story["frames"])
        rail_y=-3.29
        xs=np.linspace(-6.35,6.35,count)
        self.add(Line([xs[0],rail_y,0],[xs[-1],rail_y,0],color=PANEL_EDGE,stroke_width=3))
        for j,x in enumerate(xs):
            self.add(Dot([x,rail_y,0],radius=0.062,color=MUTED),
                     txt(str(j+1),10,MUTED).move_to([x,rail_y-0.28,0]))
        cursor=Dot([xs[0],rail_y,0],radius=0.11,color=GOLD)
        self.add(cursor)
        self.add(txt("Pause to trace each step",12,MUTED).move_to([0,-3.78,0]))
        old=None
        for i,frame in enumerate(self.story["frames"]):
            start=i*self.step_duration
            end=(i+1)*self.step_duration
            self.chapters.append({"index":i,"time":round(start,3),"start":round(start,3),
                                  "end":round(end,3),"title":frame["title"]})
            step_title=txt(f"{i+1:02d}  {frame['title']}",21,a,width=12.8,weight="BOLD")
            step_title.move_to([0,2.42,0]).to_edge(LEFT,buff=0.67)
            # Code lines remain individually laid out, with real indentation.
            code_lines=VGroup()
            lines=frame["lines"]
            line_y=0.47+(len(lines)-1)*0.39
            for k,line in enumerate(lines):
                leading=len(line)-len(line.lstrip())
                color=GOLD if k==len(lines)-1 else WHITE
                t=txt(line.lstrip(),25,color,width=6.8-leading*0.12,font=MONO)
                t.move_to([-6.16+t.width/2+leading*0.12,line_y-k*0.78,0])
                code_lines.add(t)
            note=multiline(frame["note"],20,width=12.25,chars=86,color=WHITE)
            note.move_to([0,-2.33,0])
            visual=build_visual(self.story,i,self.grade)
            content=VGroup(step_title,code_lines,note,visual)
            if old is None:
                self.play(FadeIn(content,shift=UP*0.06),run_time=0.4)
            else:
                self.play(FadeOut(old[0],shift=UP*0.03),FadeOut(old[1]),FadeOut(old[2]),
                          FadeIn(step_title,shift=UP*0.03),FadeIn(code_lines),FadeIn(note),
                          Transform(old[3],visual),cursor.animate.move_to([xs[i],rail_y,0]),
                          run_time=0.4)
                # The transformed object remains the active concrete visual.
                self.remove(visual)
                content=VGroup(step_title,code_lines,note,old[3])
            self.wait(self.step_duration-0.4)
            old=content


def vtt_time(seconds):
    millis=round(seconds*1000)
    h,millis=divmod(millis,3600000)
    m,millis=divmod(millis,60000)
    s,ms=divmod(millis,1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def probe(path):
    r=subprocess.run(["ffprobe","-v","error","-select_streams","v:0",
                      "-show_entries","stream=width,height,r_frame_rate,nb_frames,duration,codec_name,pix_fmt:format=duration",
                      "-of","json",str(path)],check=True,capture_output=True,text=True)
    return json.loads(r.stdout)


def make_asset(story,grade,force=False):
    directory=OUT/f"grade{grade}"
    directory.mkdir(parents=True,exist_ok=True)
    sid=story["id"]
    video=directory/f"{sid}.mp4"
    poster=directory/f"{sid}-poster.png"
    captions=directory/f"{sid}.vtt"
    metadata=directory/f"{sid}.json"
    if not force and all(p.exists() for p in [video,poster,captions,metadata]):
        saved=json.loads(metadata.read_text())
        print(f"Already rendered: {sid}",flush=True)
        return saved
    cache=OUT/"_manim-cache"/sid
    cache.mkdir(parents=True,exist_ok=True)
    render_config={"pixel_width":WIDTH,"pixel_height":HEIGHT,"frame_rate":FPS,
                   "frame_width":128/9,"frame_height":8,"background_color":BG,
                   "renderer":"cairo","write_to_movie":True,"save_last_frame":False,
                   "format":"mp4","output_file":sid,"media_dir":str(cache),
                   "disable_caching":True,"verbosity":"WARNING","progress_bar":"none",
                   "preview":False}
    print(f"Rendering {sid} ({len(story['frames'])} stages)",flush=True)
    with tempconfig(render_config):
        scene=RevisionAnimation(story,grade)
        scene.render()
        rendered=Path(scene.renderer.file_writer.movie_file_path)
        # Put the MP4 index at the front for browser playback and chapter seeks.
        subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y",
                        "-i",str(rendered),"-map","0:v:0","-c:v","copy","-an",
                        "-movflags","+faststart",str(video)],check=True)
        chapters=scene.chapters
    details=probe(video)
    duration=float(details["format"]["duration"])
    stream=details["streams"][0]
    assert stream["width"]==WIDTH and stream["height"]==HEIGHT
    assert stream["codec_name"]=="h264" and stream["pix_fmt"]=="yuv420p"
    assert stream["r_frame_rate"]=="15/1"
    assert abs(duration-chapters[-1]["end"])<0.12,(sid,duration,chapters[-1])
    # Use a representative explained stage, after its entrance transition.
    poster_time=chapters[min(2,len(chapters)-1)]["start"]+0.7
    subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-ss",str(poster_time),
                    "-i",str(video),"-frames:v","1",str(poster)],check=True)
    cues=["WEBVTT",""]
    for chapter,frame in zip(chapters,story["frames"]):
        cues.extend([str(chapter["index"]+1),
                     f"{vtt_time(chapter['start'])} --> {vtt_time(chapter['end'])}",
                     html.escape(frame["title"],quote=False),
                     html.escape("; ".join(frame["lines"]),quote=False),
                     html.escape(frame["note"],quote=False),""])
    captions.write_text("\n".join(cues),encoding="utf-8")
    item={"grade":grade,"id":sid,"title":story["title"],"caption":story["caption"],
          "topic":story["topic"],"video":f"animations/grade{grade}/{video.name}",
          "poster":f"animations/grade{grade}/{poster.name}",
          "captions":f"animations/grade{grade}/{captions.name}","duration":round(duration,3),
          "width":WIDTH,"height":HEIGHT,"fps":FPS,"chapters":chapters,
          "renderer":"Manim Community / Cairo"}
    metadata.write_text(json.dumps(item,ensure_ascii=False,indent=2)+"\n")
    shutil.rmtree(cache)
    print(f"Finished {sid}: {duration:.2f}s, {video.stat().st_size:,} bytes",flush=True)
    return item


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--grade",type=int,choices=[7,8,9],action="append")
    parser.add_argument("--id",action="append")
    parser.add_argument("--force",action="store_true")
    args=parser.parse_args()
    grades=args.grade or [7,8,9]
    for grade in grades:
        source=BASE/f"grade{grade}-data.json"
        if not source.exists():
            raise FileNotFoundError(f"Storyboard data is not ready: {source}")
        data=json.loads(source.read_text())
        for story in data["animations"]:
            if not args.id or story["id"] in args.id:
                make_asset(story,grade,args.force)
    # Reconstruct the manifest from completed assets, so interrupted rendering
    # can resume without losing the previously finished animations.
    entries=[]
    for path in sorted(OUT.glob("grade*/*.json")):
        entries.append(json.loads(path.read_text()))
    manifest={"version":1,"width":WIDTH,"height":HEIGHT,"fps":FPS,
              "animations":entries}
    (OUT/"animations-manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
    print(f"Manifest contains {len(entries)} completed animations.",flush=True)


if __name__=="__main__":
    main()
