package httpapi

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"
)

func TestProcessAvatar(t *testing.T) {
	src := image.NewRGBA(image.Rect(0, 0, 1000, 600))
	for y := 0; y < 600; y++ {
		for x := 0; x < 1000; x++ {
			src.Set(x, y, color.RGBA{200, 120, 20, 255})
		}
	}
	var jb bytes.Buffer
	jpeg.Encode(&jb, src, nil)
	out, err := processAvatar(jb.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	img, err := png.Decode(bytes.NewReader(out))
	if err != nil || img.Bounds().Dx() != 256 || img.Bounds().Dy() != 256 {
		t.Fatalf("bad result %v %v", err, img.Bounds())
	}

	small := image.NewRGBA(image.Rect(0, 0, 100, 80))
	var pb bytes.Buffer
	png.Encode(&pb, small)
	out, err = processAvatar(pb.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	img, _ = png.Decode(bytes.NewReader(out))
	if img.Bounds().Dx() != 80 {
		t.Fatalf("small: %v", img.Bounds())
	}
	if _, err := processAvatar([]byte("GIF89a not an image")); err == nil {
		t.Fatal("expected error for non-image")
	}
}
