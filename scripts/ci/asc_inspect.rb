# frozen_string_literal: true
# READ ONLY. Prints what is already filled in on the App Store record, without any value that could be private
# (the repo is public, so workflow logs are public: lengths and yes/no only, never review contacts or demo logins).
require_relative 'asc'

bundle = ENV['BUNDLE_ID'] || 'id.botconnector.app'
yn = ->(v) { v.to_s.strip.empty? ? 'empty' : "filled(#{v.to_s.length})" }

app = ASC.list("/v1/apps?filter[bundleId]=#{bundle}").first or abort 'app not found for this API key'
puts "app: #{app['attributes']['name']} | primaryLocale=#{app['attributes']['primaryLocale']} | appId=#{app['id']}"

puts "\n== builds (latest 6)"
ASC.list("/v1/builds?filter[app]=#{app['id']}&sort=-uploadedDate&limit=6").each { |b| a = b['attributes']; puts "  build #{a['version']} processing=#{a['processingState']} expired=#{a['expired']}" }

puts "\n== versions"
versions = ASC.list("/v1/apps/#{app['id']}/appStoreVersions?limit=10")
versions.each { |v| a = v['attributes']; puts "  #{a['platform']} #{a['versionString']} state=#{a['appStoreState']} release=#{a['releaseType']}" }
ver = versions.find { |v| %w[PREPARE_FOR_SUBMISSION DEVELOPER_REJECTED REJECTED METADATA_REJECTED].include?(v['attributes']['appStoreState']) }
puts ver ? "\neditable version: #{ver['attributes']['versionString']} (#{ver['attributes']['appStoreState']})" : "\nno editable version yet (create 2.0.0 in App Store Connect, or ask me to create it)"

# Why is a submitted version still waiting? Build/compliance/review-detail/localization snapshot + the review queue itself.
sub = versions.find { |v| %w[WAITING_FOR_REVIEW IN_REVIEW PENDING_DEVELOPER_RELEASE].include?(v['attributes']['appStoreState']) }
if sub
  sid = sub['id']
  puts "\n== submitted version #{sub['attributes']['versionString']} (#{sub['attributes']['appStoreState']})"
  b = ASC.list("/v1/appStoreVersions/#{sid}/build").first
  if b
    ba = b['attributes']
    puts "  build: #{ba['version']} uploaded=#{ba['uploadedDate']} processing=#{ba['processingState']} expired=#{ba['expired']} nonExemptEncryption=#{ba['usesNonExemptEncryption'].inspect} minOs=#{ba['minOsVersion']}"
  else
    puts '  build: NONE ATTACHED (this blocks the queue)'
  end
  rd = ASC.list("/v1/appStoreVersions/#{sid}/appStoreReviewDetail")
  r = rd.is_a?(Array) ? rd.first : rd
  if r
    ra = r['attributes']
    puts "  review detail: contact name=#{yn.(ra['contactFirstName'])} phone=#{yn.(ra['contactPhone'])} email=#{yn.(ra['contactEmail'])} demoRequired=#{ra['demoAccountRequired']} demoUser=#{yn.(ra['demoAccountName'])} demoPass=#{yn.(ra['demoAccountPassword'])} notes=#{yn.(ra['notes'])}"
  else
    puts '  review detail: none'
  end
  ASC.list("/v1/appStoreVersions/#{sid}/appStoreVersionLocalizations").each do |l|
    la = l['attributes']
    puts "  #{la['locale']}: description=#{yn.(la['description'])} keywords=#{yn.(la['keywords'])} whatsNew=#{yn.(la['whatsNew'])} support=#{yn.(la['supportUrl'])}"
    ASC.list("/v1/appStoreVersionLocalizations/#{l['id']}/appScreenshotSets").each do |s|
      shots = ASC.list("/v1/appScreenshotSets/#{s['id']}/appScreenshots")
      st = shots.map { |x| x.dig('attributes', 'assetDeliveryState', 'state') }.tally
      puts "     screenshots #{s['attributes']['screenshotDisplayType']}: #{shots.size} #{st}"
    end
  end
end

puts "\n== review submissions (queue)"
ASC.list("/v1/apps/#{app['id']}/reviewSubmissions?limit=5").each do |rs|
  ra = rs['attributes']
  puts "  submission state=#{ra['state']} platform=#{ra['platform']} submitted=#{ra['submittedDate']} cancelled=#{ra['cancelledDate']}"
  ASC.list("/v1/reviewSubmissions/#{rs['id']}/items").each do |it|
    rel = (it['relationships'] || {}).find { |_, v| v.is_a?(Hash) && v['data'] }
    puts "    item state=#{it.dig('attributes', 'state').inspect} #{rel ? "#{rel[0]}=#{rel[1]['data']['id']}" : 'rel=?'}"
  end
end

if ver
  vid = ver['id']
  b = ASC.list("/v1/appStoreVersions/#{vid}/build")
  puts "selected build: #{b.empty? ? 'none' : 'attached'}"
  puts "\n== version localizations"
  ASC.list("/v1/appStoreVersions/#{vid}/appStoreVersionLocalizations").each do |l|
    a = l['attributes']
    puts "  #{a['locale']}: description=#{yn.(a['description'])} keywords=#{yn.(a['keywords'])} whatsNew=#{yn.(a['whatsNew'])} promo=#{yn.(a['promotionalText'])} support=#{yn.(a['supportUrl'])} marketing=#{yn.(a['marketingUrl'])}"
    ASC.list("/v1/appStoreVersionLocalizations/#{l['id']}/appScreenshotSets").each do |s|
      shots = ASC.list("/v1/appScreenshotSets/#{s['id']}/appScreenshots")
      st = shots.map { |x| x.dig('attributes', 'assetDeliveryState', 'state') }.tally
      puts "     screenshots #{s['attributes']['screenshotDisplayType']}: #{shots.size} #{st}"
    end
  end
  puts "\n== review detail (yes/no only)"
  rd = ASC.list("/v1/appStoreVersions/#{vid}/appStoreReviewDetail")
  r = rd.is_a?(Array) ? rd.first : rd
  if r
    a = r['attributes']
    puts "  contact name=#{yn.(a['contactFirstName'])} phone=#{yn.(a['contactPhone'])} email=#{yn.(a['contactEmail'])} demoRequired=#{a['demoAccountRequired']} demoUser=#{yn.(a['demoAccountName'])} notes=#{yn.(a['notes'])}"
  else
    puts '  none yet'
  end
end

puts "\n== app info"
ASC.list("/v1/apps/#{app['id']}/appInfos").each do |i|
  puts "  appInfo state=#{i['attributes']['appStoreState']}"
  ASC.list("/v1/appInfos/#{i['id']}/appInfoLocalizations").each { |l| a = l['attributes']; puts "   #{a['locale']}: name=#{yn.(a['name'])} subtitle=#{yn.(a['subtitle'])} privacyUrl=#{yn.(a['privacyPolicyUrl'])}" }
  pc = ASC.get("/v1/appInfos/#{i['id']}/primaryCategory")[1].dig('data', 'id')
  sc = ASC.get("/v1/appInfos/#{i['id']}/secondaryCategory")[1].dig('data', 'id')
  puts "   categories primary=#{pc || 'none'} secondary=#{sc || 'none'}"
  ar = ASC.get("/v1/appInfos/#{i['id']}/ageRatingDeclaration")[1].dig('data')
  puts "   ageRating declaration: #{ar ? 'present' : 'none'}"
end
puts "\n(App Privacy answers are not readable through the API: check them in the App Store Connect page.)"
