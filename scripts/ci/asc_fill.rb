# frozen_string_literal: true
# Fills the App Store record for the first release. Writes only when APPLY=1; never submits for review.
# The repo is public, so nothing private is printed (no review login, no keys).
require 'digest'
require_relative 'asc'

APPLY = ENV['APPLY'] == '1'
BUNDLE = 'id.botconnector.app'
VERSION = '2.0.0'
BUILD = '110'
SUPPORT = 'https://botconnector.id/support'
CONTACT = { first: ENV.fetch('REVIEW_FIRST'), last: ENV.fetch('REVIEW_LAST'), phone: ENV.fetch('REVIEW_PHONE'), email: ENV.fetch('REVIEW_EMAIL') }

TXT = {
  'en-US' => {
    subtitle: 'All your AI in one app', privacy: 'https://botconnector.id/privacy',
    keywords: 'ai,chatbot,assistant,gpt,gemini,claude,deepseek,llm,image,offline,local,research',
    promo: 'All your AI in one app. Chat, search, research, create images, and run AI on your phone.',
    description: <<~D.strip
      BotConnector brings many AI models into one app: chat, web search, document analysis and image creation.

      • Pick models from BotConnector Cloud (free and plan models), or connect your own AI provider with an API key.
      • Run AI models on your phone, offline after the download, or connect AI running on your own laptop.
      • AI Image Studio: create pictures from text or from your own photo.
      • Web search with numbered sources, deep research, photo and document attachments.
      • Works without an account. An account is only needed for BotConnector Cloud models and features.
      • Follow your plan usage and balance, 17 languages, adjustable text size.
      • Report any reply from inside the app. Delete your account anytime in Settings.
    D
  },
  'id' => {
    subtitle: 'Semua AI dalam satu aplikasi', privacy: 'https://botconnector.id/id/privacy',
    keywords: 'ai,chatbot,asisten,gpt,gemini,claude,deepseek,llm,gambar,offline,lokal,riset',
    promo: 'Semua AI dalam satu aplikasi. Chat, cari, riset, buat gambar, dan jalankan AI di HP.',
    description: <<~D.strip
      BotConnector menyatukan banyak model AI dalam satu aplikasi: chat, cari di web, analisis dokumen, dan buat gambar.

      • Pilih model dari BotConnector Cloud (gratis dan paket), atau sambungkan penyedia AI Anda sendiri dengan API key.
      • Jalankan model AI langsung di HP (tanpa internet setelah model diunduh), atau hubungkan AI di laptop Anda.
      • AI Image Studio: buat gambar dari teks atau dari foto Anda.
      • Pencarian web dengan sumber bernomor, riset mendalam, lampirkan foto dan dokumen.
      • Bisa dipakai tanpa akun. Akun BotConnector hanya dibutuhkan untuk model dan fitur BotConnector Cloud.
      • Pantau pemakaian paket dan saldo, 17 bahasa, ukuran teks bisa diatur.
      • Laporkan jawaban yang bermasalah langsung dari aplikasi. Hapus akun kapan saja di Pengaturan.
    D
  }
}.freeze
NOTES = 'BotConnector works without an account (guest mode): add your own provider key under Settings > Provider, or download an on-device model under Settings > Local models. BotConnector Cloud features need the demo login provided. No in-app purchases; plans are managed on our website and are not sold in the app. Users can report any reply with the thumbs-down button on a reply (sent to our support desk; email fallback admin@botconnector.id), delete their account under Settings > Delete account, and open the Privacy Policy, Terms and Help from Settings and the sign-in screen. On-device models are model files (GGUF) downloaded from Hugging Face on user request; no executable code is downloaded. Model brand logos are used only to identify which model family a reply comes from.'

def err_text(j) = (j['errors'] || []).map { |e| "#{e['code']}: #{e['title']}#{e['detail'] ? ' - ' + e['detail'][0, 140] : ''}" }.join(' | ')
def step(name)
  puts "-> #{name}"
  return unless APPLY
  code, j = yield
  ok = (200..299).cover?(code)
  puts "   #{ok ? 'ok' : 'FAILED'} (#{code}) #{ok ? '' : err_text(j)}"
  @failed = true unless ok
  j
end

app = ASC.list("/v1/apps?filter[bundleId]=#{BUNDLE}").first or abort 'app not found'
ver = ASC.list("/v1/apps/#{app['id']}/appStoreVersions").find { |v| v['attributes']['appStoreState'] == 'PREPARE_FOR_SUBMISSION' } or abort 'no editable version'
vid = ver['id']
puts "mode: #{APPLY ? 'APPLY' : 'PLAN ONLY'} | version #{ver['attributes']['versionString']} -> #{VERSION}"

step('version string, copyright, manual release') do
  ASC.request('PATCH', "/v1/appStoreVersions/#{vid}", { data: { type: 'appStoreVersions', id: vid, attributes: { versionString: VERSION, copyright: '2026 BotConnector', releaseType: 'MANUAL' } } })
end

build = ASC.list("/v1/builds?filter[app]=#{app['id']}&filter[version]=#{BUILD}&filter[preReleaseVersion.version]=#{VERSION}").first
abort "build #{BUILD} (#{VERSION}) not found" unless build
step("attach build #{BUILD}") { ASC.request('PATCH', "/v1/appStoreVersions/#{vid}/relationships/build", { data: { type: 'builds', id: build['id'] } }) }

# version localizations
locs = ASC.list("/v1/appStoreVersions/#{vid}/appStoreVersionLocalizations").to_h { |l| [l['attributes']['locale'], l['id']] }
loc_ids = {}
TXT.each do |locale, t|
  attrs = { description: t[:description], keywords: t[:keywords][0, 100], promotionalText: t[:promo], supportUrl: SUPPORT, marketingUrl: 'https://botconnector.id' }
  if locs[locale]
    loc_ids[locale] = locs[locale]
    step("#{locale}: description, keywords, URLs") { ASC.request('PATCH', "/v1/appStoreVersionLocalizations/#{locs[locale]}", { data: { type: 'appStoreVersionLocalizations', id: locs[locale], attributes: attrs } }) }
  else
    j = step("#{locale}: create localization with description, keywords, URLs") { ASC.request('POST', '/v1/appStoreVersionLocalizations', { data: { type: 'appStoreVersionLocalizations', attributes: attrs.merge(locale: locale), relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: vid } } } } }) }
    loc_ids[locale] = j&.dig('data', 'id')
  end
end

# app info: names, subtitle, privacy URL, categories
info = ASC.list("/v1/apps/#{app['id']}/appInfos").find { |i| i['attributes']['appStoreState'] == 'PREPARE_FOR_SUBMISSION' } or abort 'no editable appInfo'
ilocs = ASC.list("/v1/appInfos/#{info['id']}/appInfoLocalizations").to_h { |l| [l['attributes']['locale'], l['id']] }
TXT.each do |locale, t|
  attrs = { name: 'BotConnector', subtitle: t[:subtitle], privacyPolicyUrl: t[:privacy] }
  if ilocs[locale]
    step("#{locale}: subtitle and privacy URL") { ASC.request('PATCH', "/v1/appInfoLocalizations/#{ilocs[locale]}", { data: { type: 'appInfoLocalizations', id: ilocs[locale], attributes: attrs.reject { |k, _| k == :name } } }) }
  else
    step("#{locale}: create app info localization") { ASC.request('POST', '/v1/appInfoLocalizations', { data: { type: 'appInfoLocalizations', attributes: attrs.merge(locale: locale), relationships: { appInfo: { data: { type: 'appInfos', id: info['id'] } } } } }) }
  end
end
step('categories: Productivity + Utilities') do
  ASC.request('PATCH', "/v1/appInfos/#{info['id']}", { data: { type: 'appInfos', id: info['id'], relationships: { primaryCategory: { data: { type: 'appCategories', id: 'PRODUCTIVITY' } }, secondaryCategory: { data: { type: 'appCategories', id: 'UTILITIES' } } } } })
end

# review details (the demo login is left for the owner)
rd = ASC.list("/v1/appStoreVersions/#{vid}/appStoreReviewDetail").first
attrs = { contactFirstName: CONTACT[:first], contactLastName: CONTACT[:last], contactPhone: CONTACT[:phone], contactEmail: CONTACT[:email], demoAccountRequired: true, notes: NOTES }
if rd
  step('review details (contact, notes)') { ASC.request('PATCH', "/v1/appStoreReviewDetails/#{rd['id']}", { data: { type: 'appStoreReviewDetails', id: rd['id'], attributes: attrs } }) }
else
  step('review details (contact, notes): create') { ASC.request('POST', '/v1/appStoreReviewDetails', { data: { type: 'appStoreReviewDetails', attributes: attrs, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: vid } } } } }) }
end

# screenshots: store/screenshots/<locale>/<DISPLAY_TYPE>/NN-name.png
def put_bytes(op, bytes)
  uri = URI(op['url']); req = Net::HTTP::Put.new(uri)
  (op['requestHeaders'] || []).each { |h| req[h['name']] = h['value'] }
  req.body = bytes
  Net::HTTP.start(uri.host, uri.port, use_ssl: true, read_timeout: 120) { |h| h.request(req) }.code.to_i
end
Dir['store/screenshots/*'].sort.each do |ldir|
  locale = File.basename(ldir); lid = loc_ids[locale]
  Dir["#{ldir}/*"].sort.each do |ddir|
    dtype = File.basename(ddir); files = Dir["#{ddir}/*.png"].sort
    puts "-> screenshots #{locale} #{dtype}: #{files.size} files"
    next unless APPLY
    abort "no localization id for #{locale}" unless lid
    sets = ASC.list("/v1/appStoreVersionLocalizations/#{lid}/appScreenshotSets")
    set = sets.find { |s| s['attributes']['screenshotDisplayType'] == dtype }
    unless set
      code, j = ASC.request('POST', '/v1/appScreenshotSets', { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: dtype }, relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: lid } } } } })
      (puts "   set FAILED (#{code}) #{err_text(j)}"; @failed = true; next) unless code == 201
      set = j['data']
    end
    ASC.list("/v1/appScreenshotSets/#{set['id']}/appScreenshots").each { |s| ASC.request('DELETE', "/v1/appScreenshots/#{s['id']}") }
    files.each do |f|
      bytes = File.binread(f)
      code, j = ASC.request('POST', '/v1/appScreenshots', { data: { type: 'appScreenshots', attributes: { fileName: File.basename(f), fileSize: bytes.bytesize }, relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set['id'] } } } } })
      (puts "   #{File.basename(f)} reserve FAILED (#{code}) #{err_text(j)}"; @failed = true; next) unless code == 201
      sid = j['data']['id']
      codes = j['data']['attributes']['uploadOperations'].map { |op| put_bytes(op, bytes.byteslice(op['offset'], op['length'])) }
      c2, j2 = ASC.request('PATCH', "/v1/appScreenshots/#{sid}", { data: { type: 'appScreenshots', id: sid, attributes: { uploaded: true, sourceFileChecksum: Digest::MD5.hexdigest(bytes) } } })
      ok = codes.all? { |c| c.between?(200, 299) } && c2 == 200
      puts "   #{File.basename(f)} #{ok ? 'ok' : "FAILED put=#{codes.uniq} commit=#{c2} #{err_text(j2)}"}"
      @failed = true unless ok
    end
  end
end
puts @failed ? "\nFINISHED WITH ERRORS" : "\nFINISHED"
exit(@failed ? 1 : 0)
