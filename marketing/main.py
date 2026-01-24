import os
import yt_dlp
from moviepy import VideoFileClip, ColorClip, CompositeVideoClip, ImageClip, AudioFileClip, CompositeAudioClip
import moviepy.audio.fx as afx
from PIL import Image, ImageDraw, ImageFont
from gtts import gTTS

from storage_paths import PROCESSED_DIR, RAW_DIR, ensure_storage_dirs

class VideoMonetizer:
    def __init__(self, input_dir: str | None = None, output_dir: str | None = None):
        ensure_storage_dirs()
        self.input_dir = input_dir or str(RAW_DIR)
        self.output_dir = output_dir or str(PROCESSED_DIR)
        os.makedirs(self.input_dir, exist_ok=True)
        os.makedirs(self.output_dir, exist_ok=True)
        self.font_path = "C:/Windows/Fonts/malgun.ttf" 

    def download_videos(self, link_file="links.txt"):
        """links.txt에 적힌 주소의 영상을 RAW_DIR 폴더로 다운로드합니다."""
        if not os.path.exists(link_file):
            with open(link_file, "w") as f: f.write("") # 파일이 없으면 생성
            print(f"ℹ️ {link_file} 파일이 생성되었습니다. 여기에 영상 링크를 한 줄씩 넣어주세요.")
            return

        with open(link_file, "r") as f:
            links = [line.strip() for line in f.readlines() if line.strip()]

        if not links:
            print("ℹ️ 다운로드할 링크가 없습니다. 기존 영상으로 작업을 진행합니다.")
            return

        print(f"📥 총 {len(links)}개의 영상 다운로드를 시작합니다...")
        
        # yt-dlp 옵션 설정 (파일명은 제목으로, 저장 위치는 RAW_DIR)
        ydl_opts = {
            'format': 'bestvideo+bestaudio/best',
            'outtmpl': os.path.join(self.input_dir, '%(title)s.%(ext)s'),
            'merge_output_format': 'mp4',
            'quiet': True,
            'no_warnings': True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            for link in links:
                try:
                    print(f"🔗 다운로드 중: {link}")
                    ydl.download([link])
                except Exception as e:
                    print(f"❌ 다운로드 실패 ({link}): {e}")
        
        # 다운로드가 끝난 후 링크 파일 비우기 (중복 다운로드 방지)
        with open(link_file, "w") as f: f.write("")
        print("✅ 모든 다운로드 완료 및 링크 리스트 초기화됨.")

    def create_text_image(self, text, filename, color=(255, 255, 0), size=70):
        img = Image.new('RGBA', (1000, 200), (255, 255, 255, 0))
        draw = ImageDraw.Draw(img)
        try: font = ImageFont.truetype(self.font_path, size)
        except: font = ImageFont.load_default()
        bbox = draw.textbbox((0, 0), text, font=font)
        w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text(((1000-w)/2, (200-h)/2), text, font=font, fill=color)
        img.save(filename)

    def create_voice(self, text, filename):
        tts = gTTS(text=text, lang='ko')
        tts.save(filename)

    def process_all(self):
        # 1. 먼저 다운로드 수행
        self.download_videos()

        # 2. 이후 가공 작업 진행
        files = [f for f in os.listdir(self.input_dir) if f.endswith('.mp4')]
        bgm_path = "video_bgm/bgm.mp3"

        for filename in files:
            raw_name = os.path.splitext(filename)[0]
            display_title = raw_name[:15] # 제목이 너무 길면 자막이 깨지므로 15자 제한
            input_path = os.path.join(self.input_dir, filename)
            output_path = os.path.join(self.output_dir, f"shorts_{filename}")
            
            print(f"🎬 가공 중: {display_title}")
            self.create_text_image(display_title, "top_text.png")
            self.create_text_image("구매 링크는 댓글 확인! 👇", "bottom_text.png", color=(255, 255, 255), size=55)
            self.create_voice(f"{display_title}. 지금 바로 확인해보세요!", "voice.mp3")

            try:
                with VideoFileClip(input_path) as clip:
                    w, h = clip.size
                    x1, y1, x2, y2 = int(w*0.18), int(h*0.18), int(w*0.82), int(h*0.82)
                    width, height = (x2-x1)//2*2, (y2-y1)//2*2
                    processed_clip = clip.cropped(x1=x1, y1=y1, x2=x1+width, y2=y1+height)
                    
                    bar_h = int(height * 0.2)
                    top_bar = ColorClip(size=(width, bar_h), color=(0,0,0)).with_duration(clip.duration).with_position(("center", "top"))
                    bottom_bar = ColorClip(size=(width, bar_h), color=(0,0,0)).with_duration(clip.duration).with_position(("center", "bottom"))
                    t_clip = ImageClip("top_text.png").with_duration(clip.duration).resized(width=width*0.8).with_position(("center", (bar_h // 2) - 35))
                    b_clip = ImageClip("bottom_text.png").with_duration(clip.duration).resized(width=width*0.8).with_position(("center", height - (bar_h // 2) - 27))

                    voice_audio = AudioFileClip("voice.mp3")
                    if os.path.exists(bgm_path):
                        bgm = AudioFileClip(bgm_path).with_effects([afx.AudioLoop(duration=clip.duration), afx.MultiplyVolume(0.3)])
                        final_audio = CompositeAudioClip([bgm, voice_audio])
                    else:
                        final_audio = voice_audio
                    
                    final_video = CompositeVideoClip([processed_clip, top_bar, bottom_bar, t_clip, b_clip]).with_audio(final_audio)
                    final_video.write_videofile(output_path, codec="libx264", audio_codec="aac", fps=clip.fps, logger=None)
                
                # 가공 완료 후 원본은 삭제 (원치 않으면 아래 줄 주석 처리)
                # os.remove(input_path)
                print(f"✅ 완성: {output_path}")
            except Exception as e:
                print(f"❌ 에러: {e}")

    def run_pipeline(self, urls, affiliate_link):
        from downloader import run_collect

        user_agent = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
        run_collect(urls, affiliate_link, user_agent)
        self.process_all()

if __name__ == "__main__":
    monetizer = VideoMonetizer()
    monetizer.process_all()