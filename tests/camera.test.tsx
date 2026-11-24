import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { addPhoto, phoneOf, removePhoto, setPhotoWallpaper, wallpaperCss, MAX_PHOTOS } from '../src/engine/phone';
import { publish } from '../src/engine/social';
import { CameraApp } from '../src/ui/CameraApp';
import { makeCareer } from './helpers';

const photo = (n: number) => `data:image/jpeg;base64,${'A'.repeat(50 + n)}`;

describe('câmera: fotos, fundo de tela e post', () => {
  it('guarda as fotos (máx. 12), usa uma de fundo e apaga', () => {
    let g = makeCareer('palmeiras', 3);
    for (let i = 0; i < 15; i++) g = addPhoto(g, photo(i));
    expect(phoneOf(g).photos!.length).toBe(MAX_PHOTOS);
    expect(phoneOf(addPhoto(g, 'http://x/y.png')).photos!.length).toBe(MAX_PHOTOS); // só JPEG da câmera
    const p = phoneOf(g).photos![0];
    g = setPhotoWallpaper(g, p);
    expect(phoneOf(g).settings.wallpaper).toBe('foto'); expect(wallpaperCss(g)).toContain(p);
    g = removePhoto(g, p);
    expect(phoneOf(g).settings.wallpaper).toBe('azul'); expect(phoneOf(g).wallpaperPhoto).toBeUndefined();
  });
  it('a selfie vira post com a foto, e a tela da câmera abre', () => {
    const g = makeCareer('palmeiras', 3);
    const r = publish(g, 'linstagra', 'selfie', photo(1));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.post.photo).toBe(photo(1));
    const html = renderToStaticMarkup(createElement(CameraApp, { game: g, onChange: () => {} }));
    expect(html).toContain('Câmera frontal');
  });
});
