-- Clear existing sources and populate with complete set
DELETE FROM rss_sources;

-- Defense and Military Sources (US)
INSERT INTO rss_sources (name, rss_url, main_url, category, active, update_frequency, created_at) VALUES
('Defense One', 'https://www.defenseone.com/rss/all/', 'https://www.defenseone.com', 'defense_policy', 1, 'daily', datetime('now')),
('Breaking Defense', 'https://breakingdefense.com/rss/', 'https://breakingdefense.com', 'defense_industry', 1, 'daily', datetime('now')),
('Defense News', 'https://www.defensenews.com/arc/outboundfeeds/rss/', 'https://www.defensenews.com', 'global_defense', 1, 'daily', datetime('now')),
('DefenseScoop', 'https://defensescoop.com/feed/', 'https://defensescoop.com', 'defense_tech', 1, 'daily', datetime('now')),
('Pentagon Contracts', 'https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=9', 'https://www.defense.gov', 'procurement', 1, 'daily', datetime('now')),
('C4ISRNET', 'https://www.c4isrnet.com/arc/outboundfeeds/rss/', 'https://www.c4isrnet.com', 'military_tech', 1, 'daily', datetime('now')),
('Military.com', 'https://www.military.com/rss/news.xml', 'https://www.military.com', 'military_news', 1, 'daily', datetime('now')),
('Stars and Stripes', 'https://www.stripes.com/news/feed.rss', 'https://www.stripes.com', 'military_news', 1, 'daily', datetime('now')),
('Army Times', 'https://www.armytimes.com/arc/outboundfeeds/rss/', 'https://www.armytimes.com', 'military_branch', 1, 'daily', datetime('now')),
('Navy Times', 'https://www.navytimes.com/arc/outboundfeeds/rss/', 'https://www.navytimes.com', 'military_branch', 1, 'daily', datetime('now')),
('Air Force Times', 'https://www.airforcetimes.com/arc/outboundfeeds/rss/', 'https://www.airforcetimes.com', 'military_branch', 1, 'daily', datetime('now')),
('Marine Corps Times', 'https://www.marinecorpstimes.com/arc/outboundfeeds/rss/', 'https://www.marinecorpstimes.com', 'military_branch', 1, 'daily', datetime('now')),

-- Think Tanks and Research
('Institute for the Study of War', 'https://www.understandingwar.org/rss.xml', 'https://www.understandingwar.org', 'conflict_analysis', 1, 'daily', datetime('now')),
('RAND Corporation', 'https://www.rand.org/topics/national-security.xml', 'https://www.rand.org', 'research', 1, 'daily', datetime('now')),
('Center for Strategic & International Studies', 'https://www.csis.org/rss/csisaudio.xml', 'https://www.csis.org', 'strategic_analysis', 1, 'daily', datetime('now')),
('Atlantic Council', 'https://www.atlanticcouncil.org/feed/', 'https://www.atlanticcouncil.org', 'global_affairs', 1, 'daily', datetime('now')),
('Brookings Institution', 'https://www.brookings.edu/topic/defense-security/feed/', 'https://www.brookings.edu', 'policy_analysis', 1, 'daily', datetime('now')),
('Carnegie Endowment', 'https://carnegieendowment.org/feed.xml', 'https://carnegieendowment.org', 'global_policy', 1, 'daily', datetime('now')),
('Council on Foreign Relations', 'https://www.cfr.org/rss/latest.xml', 'https://www.cfr.org', 'foreign_policy', 1, 'daily', datetime('now')),
('Heritage Foundation', 'https://www.heritage.org/rss.xml', 'https://www.heritage.org', 'conservative_policy', 1, 'daily', datetime('now')),

-- Cybersecurity
('CISA Advisories', 'https://www.cisa.gov/cybersecurity-advisories/all.xml', 'https://www.cisa.gov', 'cybersecurity', 1, 'daily', datetime('now')),
('KrebsOnSecurity', 'https://krebsonsecurity.com/feed/', 'https://krebsonsecurity.com', 'cybersecurity', 1, 'daily', datetime('now')),
('The Hacker News', 'https://feeds.feedburner.com/TheHackersNews', 'https://thehackernews.com', 'cybersecurity', 1, 'daily', datetime('now')),
('Dark Reading', 'https://www.darkreading.com/rss.xml', 'https://www.darkreading.com', 'cybersecurity', 1, 'daily', datetime('now')),
('Threatpost', 'https://threatpost.com/feed/', 'https://threatpost.com', 'cybersecurity', 1, 'daily', datetime('now')),

-- Technology & Innovation
('DroneLife', 'https://dronelife.com/feed/', 'https://dronelife.com', 'drone_tech', 1, 'daily', datetime('now')),
('Defense Industry Daily', 'https://www.defenseindustrydaily.com/feed/', 'https://www.defenseindustrydaily.com', 'defense_industry', 1, 'daily', datetime('now')),
('SpaceNews', 'https://spacenews.com/feed/', 'https://spacenews.com', 'space_defense', 1, 'daily', datetime('now')),
('Via Satellite', 'https://www.viasatellite.com/feed/', 'https://www.viasatellite.com', 'satellite_tech', 1, 'daily', datetime('now')),

-- Intelligence and OSINT
('Bellingcat', 'https://www.bellingcat.com/rss', 'https://www.bellingcat.com', 'osint_investigations', 1, 'daily', datetime('now')),
('Intelligence Online', 'https://www.intelligenceonline.com/rss/all', 'https://www.intelligenceonline.com', 'intelligence', 1, 'daily', datetime('now')),

-- Russian Sources
('RT (Russia Today)', 'https://www.rt.com/rss/', 'https://www.rt.com', 'state_media', 1, 'daily', datetime('now')),
('Sputnik', 'https://sputnikglobe.com/rss/', 'https://sputnikglobe.com', 'state_media', 1, 'daily', datetime('now')),
('TASS', 'https://tass.com/rss/v2.xml', 'https://tass.com', 'state_news_agency', 1, 'daily', datetime('now')),
('Moscow Times', 'https://www.themoscowtimes.com/rss/news', 'https://www.themoscowtimes.com', 'independent_media', 1, 'daily', datetime('now')),
('RIA Novosti', 'https://ria.ru/export/rss2/world/index.xml', 'https://ria.ru', 'state_media', 1, 'daily', datetime('now')),

-- Chinese Sources
('Xinhua News', 'http://www.xinhuanet.com/english/rss/chinarss.xml', 'http://www.xinhuanet.com/english/', 'state_news_agency', 1, 'daily', datetime('now')),
('Global Times', 'http://www.globaltimes.cn/rss/outbrain.xml', 'http://www.globaltimes.cn', 'state_media', 1, 'daily', datetime('now')),
('South China Morning Post', 'https://www.scmp.com/rss/91/feed', 'https://www.scmp.com', 'independent_media', 1, 'daily', datetime('now')),
('China Daily', 'http://www.chinadaily.com.cn/rss/world_rss.xml', 'http://www.chinadaily.com.cn', 'state_media', 1, 'daily', datetime('now')),

-- Middle East Sources
('Al Jazeera English', 'https://www.aljazeera.com/xml/rss/all.xml', 'https://www.aljazeera.com', 'international_media', 1, 'daily', datetime('now')),
('Arab News', 'https://www.arabnews.com/rss', 'https://www.arabnews.com', 'international_media', 1, 'daily', datetime('now')),
('IRNA', 'https://en.irna.ir/rss', 'https://en.irna.ir', 'state_news_agency', 1, 'daily', datetime('now')),
('Tasnim News Agency', 'https://www.tasnimnews.com/en/rss/feed/0/8/0', 'https://www.tasnimnews.com', 'semi_official_media', 1, 'daily', datetime('now')),
('Jerusalem Post', 'https://www.jpost.com/rss/rssfeedsfrontpage.aspx', 'https://www.jpost.com', 'mainstream_media', 1, 'daily', datetime('now')),
('Times of Israel', 'https://www.timesofisrael.com/feed/', 'https://www.timesofisrael.com', 'mainstream_media', 1, 'daily', datetime('now')),
('Haaretz Headlines', 'https://www.haaretz.com/srv/haaretz-latest-headlines', 'https://www.haaretz.com', 'mainstream_media', 1, 'daily', datetime('now')),
('Middle East Monitor', 'https://www.middleeastmonitor.com/feed/', 'https://www.middleeastmonitor.com', 'regional_media', 1, 'daily', datetime('now')),

-- European Sources
('Deutsche Welle', 'https://rss.dw.com/xml/rss-en-all', 'https://www.dw.com', 'international_broadcaster', 1, 'daily', datetime('now')),
('France24', 'https://www.france24.com/en/rss', 'https://www.france24.com', 'international_broadcaster', 1, 'daily', datetime('now')),
('European Security & Defence', 'https://euro-sd.com/feed/', 'https://euro-sd.com', 'defense_magazine', 1, 'daily', datetime('now')),
('Defense24', 'https://defence24.pl/rss', 'https://defence24.pl', 'regional_news', 1, 'daily', datetime('now')),
('Jane''s Defence Weekly', 'https://www.janes.com/feeds/defence-news', 'https://www.janes.com', 'defense_intelligence', 1, 'daily', datetime('now')),
('UK Defence Journal', 'https://ukdefencejournal.org.uk/feed/', 'https://ukdefencejournal.org.uk', 'defense_analysis', 1, 'daily', datetime('now')),
('Forces Network', 'https://www.forces.net/feed', 'https://www.forces.net', 'military_media', 1, 'daily', datetime('now')),

-- Asian Sources
('Yonhap News Agency', 'https://en.yna.co.kr/RSS/news.xml', 'https://en.yna.co.kr', 'national_news_agency', 1, 'daily', datetime('now')),
('NHK World', 'https://www3.nhk.or.jp/rss/news/cat0.xml', 'https://www3.nhk.or.jp', 'public_broadcaster', 1, 'daily', datetime('now')),
('Times of India', 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', 'https://timesofindia.indiatimes.com', 'mainstream_media', 1, 'daily', datetime('now')),
('Indian Defence Research Wing', 'https://www.indiandefensenews.in/feeds/posts/default', 'https://www.indiandefensenews.in', 'defense_specialist', 1, 'daily', datetime('now')),
('Manohar Parrikar Institute', 'https://www.idsa.in/rss', 'https://www.idsa.in', 'strategic_analysis', 1, 'daily', datetime('now')),

-- Ukrainian and Eastern European
('Militarnyi', 'https://mil.in.ua/en/feed/', 'https://mil.in.ua', 'regional_news', 1, 'daily', datetime('now')),
('Kyiv Independent', 'https://kyivindependent.com/rss/', 'https://kyivindependent.com', 'independent_media', 1, 'daily', datetime('now')),
('Defence-UA', 'https://defence-ua.com/rss.xml', 'https://defence-ua.com', 'defense_analysis', 1, 'daily', datetime('now')),

-- African Sources  
('DefenceWeb', 'https://www.defenceweb.co.za/feed/', 'https://www.defenceweb.co.za', 'regional_defense', 1, 'daily', datetime('now')),
('Institute for Security Studies', 'https://issafrica.org/rss.xml', 'https://issafrica.org', 'security_research', 1, 'daily', datetime('now')),

-- International Organizations
('UN News', 'https://www.un.org/sg/en/rss.xml', 'https://www.un.org', 'multilateral_org', 1, 'daily', datetime('now')),
('NATO News', 'https://www.nato.int/cps/en/natohq/news.rss', 'https://www.nato.int', 'alliance_news', 1, 'daily', datetime('now')),
('IAEA News', 'https://www.iaea.org/rss/news/all', 'https://www.iaea.org', 'nuclear_security', 1, 'daily', datetime('now')),

-- Additional Specialized Sources
('Foreign Policy', 'https://foreignpolicy.com/feed/', 'https://foreignpolicy.com', 'international_affairs', 1, 'daily', datetime('now')),
('War on the Rocks', 'https://warontherocks.com/feed/', 'https://warontherocks.com', 'strategy_analysis', 1, 'daily', datetime('now')),
('Lawfare', 'https://www.lawfareblog.com/feed', 'https://www.lawfareblog.com', 'legal_security', 1, 'daily', datetime('now')),
('Small Wars Journal', 'https://smallwarsjournal.com/rss.xml', 'https://smallwarsjournal.com', 'military_strategy', 1, 'daily', datetime('now')),

-- Economic and Trade
('Defense & Aerospace Report', 'https://www.da-report.com/feed/', 'https://www.da-report.com', 'defense_economics', 1, 'daily', datetime('now')),
('AIN Defense Perspective', 'https://www.ainonline.com/rss/defense', 'https://www.ainonline.com', 'defense_industry', 1, 'daily', datetime('now')),

-- Additional Tech and Innovation  
('Defense Innovation Unit', 'https://www.diu.mil/rss', 'https://www.diu.mil', 'defense_innovation', 1, 'daily', datetime('now')),
('MIT Technology Review - Security', 'https://www.technologyreview.com/rss/', 'https://www.technologyreview.com', 'tech_security', 1, 'daily', datetime('now')),

-- Regional Conflict Analysis
('Syria Direct', 'https://syriadirect.org/feed/', 'https://syriadirect.org', 'conflict_reporting', 1, 'daily', datetime('now')),
('Long War Journal', 'https://www.longwarjournal.org/feed', 'https://www.longwarjournal.org', 'counterterrorism', 1, 'daily', datetime('now')),

-- Maritime and Naval
('Naval News', 'https://www.navalnews.com/feed/', 'https://www.navalnews.com', 'naval_defense', 1, 'daily', datetime('now')),
('MarineLink', 'https://www.marinelink.com/rss/news', 'https://www.marinelink.com', 'maritime_security', 1, 'daily', datetime('now')),

-- Space and Satellite Defense
('SpacePolicy Online', 'https://www.spacepolicyonline.com/feed/', 'https://www.spacepolicyonline.com', 'space_policy', 1, 'daily', datetime('now')),
('Secure World Foundation', 'https://swfound.org/feed/', 'https://swfound.org', 'space_security', 1, 'daily', datetime('now')),

-- Arms Control and Nuclear
('Arms Control Association', 'https://www.armscontrol.org/rss', 'https://www.armscontrol.org', 'arms_control', 1, 'daily', datetime('now')),
('Nuclear Threat Initiative', 'https://www.nti.org/rss/', 'https://www.nti.org', 'nuclear_security', 1, 'daily', datetime('now')),

-- Additional Regional Sources
('Australian Strategic Policy Institute', 'https://www.aspi.org.au/feed', 'https://www.aspi.org.au', 'regional_strategy', 1, 'daily', datetime('now')),
('Lowy Institute', 'https://www.lowyinstitute.org/rss.xml', 'https://www.lowyinstitute.org', 'indo_pacific', 1, 'daily', datetime('now'));

-- Update the count
UPDATE rss_sources SET created_at = datetime('now') WHERE created_at IS NULL;