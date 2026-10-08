import { plainText } from '../src/lib/speech'
describe('plainText', () => {
  it('drops code, link targets, citations and markdown symbols', () => {
    expect(plainText('# Judul\n\nIni **tebal** [1] dan [tautan](https://x.id/a).\n\n```js\nconst a = 1\n```\n\n- satu\n- dua\n1. tiga')).toBe('Judul Ini tebal dan tautan. satu dua tiga')
    expect(plainText('lihat https://contoh.com/x ya')).toBe('lihat ya')
  })
})
