/**
 * Township-to-Region mapping for Myanmar.
 * Used when user document lacks region but has township (e.g. legacy midwife accounts).
 * Derives region from township so Regional Officers can see patients in their region.
 */
(function(global) {
  const myanmarRegions = {
    "Ayeyarwady Region": ["Bogale","Danubyu","Dedaye","Einme","Hinthada","Ingapu","Kangyidaunt","Kyaiklat","Kyangin","Kyaunggon","Kyonpyaw","Labutta","Lemyethna","Maubin","Mawlamyinegyun","Myanaung","Ngapudaw","Nyaungdon","Pantanaw","Pathein","Pyapon","Thabaung","Wakema","Yegyi","Zalun","Yedashe"],
    "Bago Region (East)": ["Bago","Daik-U","Htantabin","Kawa","Kyaukkyi","Kyauktaga","Nyaunglebin","Oktwin","Phyu","Shwegyin","Taungoo","Thanatpin","Waw","Yedashe"],
    "Bago Region (West)": ["Letpadan","Minhla","Monyo","Nattalin","Okpho","Paukkaung","Paungde","Pyay","Shwedaung","Tharrawaddy","Zigon"],
    "Chin State": ["Falam","Hakha","Htantlang","Kanpetlet","Matupi","Mindat","Paletwa","Tedim","Tonzang"],
    "Kachin State": ["Bhamo","Chipwi","Hpakant","Hsawlaw","Injangyang","Kawnglanghpu","Machanbaw","Mansi","Mogaung","Mohnyin","Momauk","Myitkyina","Puta-O","Shwegu","Sumprabum","Tsawlaw","Waingmaw"],
    "Kayah State": ["Bawlake","Demoso","Hpasawng","Hpruso","Loikaw","Mese","Shadaw"],
    "Kayin State": ["Hlaingbwe","Hpa-An","Hpapun","Kawkareik","Kyainseikgyi","Myawaddy","Thandaunggyi"],
    "Magway Region": ["Aunglan","Chauk","Gangaw","Kamma","Minbu","Mindon","Minhla","Myaing","Myothit","Natmauk","Ngape","Pakokku","Pauk","Pwintbyu","Salin","Saw","Seikphyu","Sidoktaya","Sinbaungwe","Taungdwingyi","Tilin","Yenangyaung","Yesagyo"],
    "Mandalay Region": ["Amarapura","Aungmyaythazan","Chanayethazan","Chanmyathazi","Kyaukpadaung","Kyaukse","Madaya","Mahaaungmyay","Mahlaing","Meiktila","Mogoke","Myingyan","Myittha","Natogyi","Ngazun","Nyaung-U","Patheingyi","Pyigyidagun","Pyinoolwin","Singu","Sintgaing","Tada-U","Taungtha","Thazi","Wundwin","Yamethin"],
    "Mon State": ["Bilin","Chaungzon","Kyaikmaraw","Kyaikto","Mawlamyine","Mudon","Paung","Thanbyuzayat","Thaton","Ye"],
    "Nay Pyi Taw": ["Dekkhinathiri","Lewe","Ottarathiri","Pobbathiri","Pyinmana","Tatkon","Zabuthiri"],
    "Rakhine State": ["Ann","Buthidaung","Gwa","Kyaukpyu","Kyauktaw","Maungdaw","Minbya","Mrauk-U","Munaung","Myebon","Pauktaw","Ponnagyun","Ramree","Rathedaung","Sittwe","Thandwe","Toungup"],
    "Sagaing Region": ["Ayadaw","Banmauk","Budalin","Chaung-U","Hkamti","Homalin","Indaw","Kale","Kani","Katha","Kawlin","Khin-U","Kyunhla","Lahe","Lay Shi","Mawlaik","Mingin","Monywa","Nanyun","Pale","Paungbyin","Pinlebu","Salingyi","Shwebo","Tabayin","Tamu","Taze","Tigyaing","Wetlet","Wuntho","Ye-U","Yinmabin"],
    "Shan State (South)": ["Hopong","Hsiseng","Kalaw","Kunhing","Kyaukme","Kyethi","Lawksawk","Loilen","Mawkmai","Monghsu","Mongkaung","Mongnai","Nansang","Nawnghkio","Pekon","Pinlaung","Taunggyi"],
    "Shan State (North)": ["Hseni","Kutkai","Lashio","Laukkaing","Mabein","Manton","Mongmao","Mongmit","Mongyai","Muse","Namkham","Namhsan","Namtu","Nawnghkio","Pangsang","Pangwaun","Tangyan"],
    "Shan State (East)": ["Kengtung","Monghpyak","Monghsat","Mongkhet","Mongla","Mongping","Mongton","Mongyang","Tachileik"],
    "Tanintharyi Region": ["Bokpyin","Dawei","Kawthaung","Kyunsu","Launglon","Myeik","Palaw","Tanintharyi","Thayetchaung","Yebyu"],
    "Yangon Region": ["Ahlone","Bahan","Botataung","Cocokyun","Dagon","Dagon Myothit (East)","Dagon Myothit (North)","Dagon Myothit (Seikkan)","Dagon Myothit (South)","Dala","Dawbon","Hlaing","Hlaingthaya (East)","Hlaingthaya (West)","Hlegu","Hmawbi","Insein","Kamaryut","Kyauktada","Kyauktan","Kyeemyindaing","Lanmadaw","Latha","Mayangone","Mingaladon","Mingalar Taung Nyunt","North Okkalapa","Pabedan","Pazundaung","Sanchaung","Seikkyi Khanaungto","Shwepyithar","South Dagon","South Okkalapa","Tamwe","Thingangyun","Thaketa","Thanlyn","Yankin"]
  };

  const TOWNSHIP_TO_REGION = {};
  for (const [region, townships] of Object.entries(myanmarRegions)) {
    for (const tsp of townships) {
      if (!TOWNSHIP_TO_REGION[tsp]) {
        TOWNSHIP_TO_REGION[tsp] = region;
      }
    }
  }

  function getRegionFromTownship(township) {
    if (!township || typeof township !== 'string') return '';
    const t = township.trim();
    return TOWNSHIP_TO_REGION[t] || TOWNSHIP_TO_REGION[township] || '';
  }

  global.getRegionFromTownship = getRegionFromTownship;
  global.TOWNSHIP_TO_REGION = TOWNSHIP_TO_REGION;
})(typeof window !== 'undefined' ? window : globalThis);
