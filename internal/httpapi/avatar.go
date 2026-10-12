package httpapi

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	maxAvatarBytes = 5 << 20
	avatarSize     = 256
	maxAvatarSide  = 4096
)

var avatarURLRe = regexp.MustCompile(`^/api/avatars/[0-9a-f-]{36}\.png(\?v=\d+)?$`)

func avatarDir() string {
	dir := os.Getenv("UPLOAD_DIR")
	if dir == "" {
		dir = "uploads"
	}
	return filepath.Join(dir, "avatars")
}

func avatarPath(id uuid.UUID) string {
	return filepath.Join(avatarDir(), id.String()+".png")
}

func (s *Server) meAvatar(w http.ResponseWriter, r *http.Request) {
	id := currentUserID(r)

	switch r.Method {
	case http.MethodPost:
		r.Body = http.MaxBytesReader(w, r.Body, maxAvatarBytes+(1<<20))
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			var tooBig *http.MaxBytesError
			if errors.As(err, &tooBig) {
				badRequest(w, "Аватар: не более 5 МБ")
				return
			}
			badRequest(w, "Некорректная загрузка файла")
			return
		}
		file, _, err := r.FormFile("avatar")
		if err != nil {
			badRequest(w, "Выберите файл изображения")
			return
		}
		defer file.Close()

		data, err := io.ReadAll(io.LimitReader(file, maxAvatarBytes+1))
		if err != nil {
			badRequest(w, "Не удалось прочитать файл")
			return
		}
		if len(data) > maxAvatarBytes {
			badRequest(w, "Аватар: не более 5 МБ")
			return
		}

		out, err := processAvatar(data)
		if err != nil {
			badRequest(w, err.Error())
			return
		}
		if err := saveAvatarFile(id, out); err != nil {
			s.writeError(w, err)
			return
		}

		url := fmt.Sprintf("/api/avatars/%s.png?v=%d", id, time.Now().Unix())
		if _, err := s.db.Exec(r.Context(), `UPDATE users SET avatar_url=$2, updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL`, id, url); err != nil {
			s.writeError(w, err)
			return
		}

	case http.MethodDelete:
		if _, err := s.db.Exec(r.Context(), `UPDATE users SET avatar_url=NULL, updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL`, id); err != nil {
			s.writeError(w, err)
			return
		}
		_ = os.Remove(avatarPath(id))

	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
		return
	}

	profile, err := s.loadProfile(r, id)
	if err != nil {
		s.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, profile)
}

func (s *Server) serveAvatar(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Метод не поддерживается"})
		return
	}
	name := strings.TrimPrefix(r.URL.Path, "/api/avatars/")
	id, err := uuid.Parse(strings.TrimSuffix(name, ".png"))
	if err != nil || !strings.HasSuffix(name, ".png") {
		http.NotFound(w, r)
		return
	}
	f, err := os.Open(avatarPath(id))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeContent(w, r, "", info.ModTime(), f)
}

func saveAvatarFile(id uuid.UUID, data []byte) error {
	if err := os.MkdirAll(avatarDir(), 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(avatarDir(), "upload-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return err
	}
	if err := os.Rename(tmpName, avatarPath(id)); err != nil {
		os.Remove(tmpName)
		return err
	}
	return nil
}
func processAvatar(data []byte) ([]byte, error) {
	switch http.DetectContentType(data) {
	case "image/jpeg", "image/png":
	default:
		return nil, errors.New("Допустимые форматы аватара: JPG, PNG, WebP")
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width < 1 || cfg.Height < 1 {
		return nil, errors.New("Не удалось прочитать изображение")
	}
	if cfg.Width > maxAvatarSide || cfg.Height > maxAvatarSide {
		return nil, errors.New("Изображение слишком большое (максимум 4096×4096)")
	}
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, errors.New("Не удалось прочитать изображение")
	}

	dst := cropResizeSquare(src, avatarSize)
	var buf bytes.Buffer
	if err := png.Encode(&buf, dst); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func cropResizeSquare(src image.Image, size int) *image.RGBA {
	b := src.Bounds()
	side := b.Dx()
	if b.Dy() < side {
		side = b.Dy()
	}
	x0 := b.Min.X + (b.Dx()-side)/2
	y0 := b.Min.Y + (b.Dy()-side)/2

	out := size
	if side < out {
		out = side
	}
	dst := image.NewRGBA(image.Rect(0, 0, out, out))
	scale := float64(side) / float64(out)

	for y := 0; y < out; y++ {
		sy0 := int(float64(y) * scale)
		sy1 := int(float64(y+1) * scale)
		if sy1 <= sy0 {
			sy1 = sy0 + 1
		}
		for x := 0; x < out; x++ {
			sx0 := int(float64(x) * scale)
			sx1 := int(float64(x+1) * scale)
			if sx1 <= sx0 {
				sx1 = sx0 + 1
			}
			var r, g, bl, a, n uint64
			for sy := sy0; sy < sy1 && sy < side; sy++ {
				for sx := sx0; sx < sx1 && sx < side; sx++ {
					cr, cg, cb, ca := src.At(x0+sx, y0+sy).RGBA()
					r += uint64(cr)
					g += uint64(cg)
					bl += uint64(cb)
					a += uint64(ca)
					n++
				}
			}
			if n == 0 {
				continue
			}
			dst.SetRGBA64(x, y, color.RGBA64{
				R: uint16(r / n), G: uint16(g / n), B: uint16(bl / n), A: uint16(a / n),
			})
		}
	}
	return dst
}

var _ = jpeg.Decode
