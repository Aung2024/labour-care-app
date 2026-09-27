(function (global) {
  'use strict'

  var row = function (label, path) {
    return { label: label, path: path || '' }
  }
  var pair = function (label, malePath, femalePath) {
    return { label: label, malePath: malePath, femalePath: femalePath }
  }

  var FORMS = [
    {
      id: 'form-1',
      title: 'လချုပ်ပုံစံ (၁)-၁',
      rows: [
        row('ယခုလမှတ်ပုံတင် ကိုယ်ဝန်ဆောင်အသစ်ပေါင်း', 'anc.new'),
        row('မှတ်ပုံတင်ကိုယ်ဝန်ဆောင်အသစ်များအနက် ကိုယ်ဝန် (၁၂) ပတ်ဝန်းကျင် လာပြသူ', 'anc.early'),
        row('ယခင်ကလေးမွေးပြီး (၂၄) လအတွင်း ယခုထပ်မံကိုယ်ဝန်ဆောင်သူ', 'hmis.newAncUnder24Months'),
        row('စောင့်ရှောက်ပေးသည့် ကိုယ်ဝန်ဆောင် စုစုပေါင်း (အကြိမ်)', 'anc.services'),
        row('ကျွမ်းကျင်သူက အိမ်တိုင်ရာရောက် မွေးဖွားပေးသည့် မိခင်', 'delivery.homeSkilled'),
        row('ကျွမ်းကျင်သူက အစိုးရဆေးရုံ/ကျန်းမာရေးဌာနတွင် မွေးဖွားပေးသည့် မိခင်', 'hmis.publicSkilledDeliveries'),
        row('ကိုယ်ဝန်စောင့်ရှောက်မှု အနည်းဆုံး (၈) ကြိမ်ရရှိသည့် အရှင်မွေးမိခင်', 'pnc.mothersWithAnc8'),
        row('ကိုယ်ဝန်စောင့်ရှောက်မှု အနည်းဆုံး (၄) ကြိမ်ရရှိသည့် အရှင်မွေးမိခင်', 'pnc.mothersWithAnc4'),
        row('အချင်းမကျမီ သားအိမ်ကျုံ့ဆေးရရှိသည့် မွေးပြီးမိခင်', 'delivery.uterotonic')
      ]
    },
    {
      id: 'form-2',
      title: 'လချုပ်ပုံစံ (၁)-၂',
      rows: [
        row('မွေးပြီး (၄၈) နာရီအတွင်း စောင့်ရှောက်မှုရသည့် မွေးပြီးမိခင်', 'pnc.within48Hours'),
        row('မွေးပြီးမိခင်စောင့်ရှောက်မှု အနည်းဆုံး (၄) ကြိမ်', 'pnc.atLeast4'),
        row('အထက်အဆင့်သို့ လွှဲပြောင်းပေးသည့် မိခင်', 'referral.total'),
        row('အန္တရာယ်ဖြစ်နိုင်ခြေရှိသော ကိုယ်ဝန်ဆောင်အသစ်', 'highRisk.clients'),
        row('ကိုယ်အလေးချိန်တိုင်းသည့် အရှင်မွေးကလေး', 'newborn.birthWeightMeasured'),
        row('ကိုယ်အလေးချိန်မပြည့်သည့် အရှင်မွေးကလေး', 'newborn.lowBirthWeight'),
        row('သန်ချဆေးရရှိသည့် ကိုယ်ဝန်ဆောင်မိခင်', 'anc.deworming'),
        row('သံဓာတ်ဆေး (၃) ကြိမ်နှင့်အထက် ရရှိသည့် မွေးဖွားပြီးမိခင်', 'hmis.ironThreePlusDelivered'),
        row('ဗီတာမင်ဘီဝမ်းရရှိသည့် ကိုယ်ဝန်ဆောင်မိခင်', 'anc.vitaminB1'),
        row('ဗီတာမင်ဘီဝမ်းရရှိသည့် မွေးပြီးမိခင် (၄၂ ရက်အတွင်း)', 'pnc.vitaminB1'),
        row('ဗီတာမင်ဘီဝမ်းရရှိသည့် နို့တိုက်မိခင် (၄၃ ရက်မှ ၈၄ ရက်)', 'hmis.pncB1Day43To84'),
        row('ဗီတာမင်အေရရှိသည့် မွေးပြီးမိခင် (၄၂ ရက်အတွင်း)', 'hmis.pncVitaminAWithin42'),
        row('ဟီမိုဂလိုဘင်စစ်ဆေးသော ကိုယ်ဝန်ဆောင်အသစ်', 'hmis.newAncHemoglobin'),
        row('သွေးအားနည်းသော ကိုယ်ဝန်ဆောင်မိခင်', 'hmis.ancAnemia')
      ]
    },
    {
      id: 'form-3',
      title: 'လချုပ်ပုံစံ (၁)-၃',
      rows: [
        row('မွေးပြီးတစ်နာရီအတွင်း မိခင်နို့တိုက်ကျွေးသည့် ကလေး', 'newborn.earlyBreastfeeding'),
        row('မွေးပြီး (၂) ရက်အတွင်း စောင့်ရှောက်မှုရသော မွေးကင်းစ', 'newborn.careWithin2Days'),
        row('မွေးပြီးပြီးချင်း အသက်မရှူသည့် ကလေး', 'hmis.notBreathing'),
        row('လေအိတ်နှင့်မျက်နှာဖုံးဖြင့် အသက်ကယ်ပြုစုသည့် ကလေး', 'hmis.bagMask'),
        row('အသက်ကယ်ပြုစုပြီးနောက် အသက်ရှင်/လွှဲပြောင်းသည့် ကလေး', 'hmis.bagMaskSurvived'),
        row('၂ ကီလိုမပြည့်/လမစေ့မွေးသည့် မွေးကင်းစ', 'newborn.kmcEligible'),
        row('မိခင်ရင်ခွင်ကပ်ပြုစုမှု (KMC) ရရှိသော ကလေး', 'newborn.kmcYes')
      ]
    },
    { id: 'form-4', title: 'လချုပ်ပုံစံ (၁)-၄', rows: [], handwriting: 'စောင့်ကြပ်ကြည့်ရှုရသော ရောဂါများ' },
    { id: 'form-5', title: 'လချုပ်ပုံစံ (၁)-၅', rows: [], handwriting: 'ငှက်ဖျား၊ သွေးတိုး/ဆီးချို နှင့် ထိခိုက်မှု' },
    {
      id: 'form-6',
      title: 'လချုပ်ပုံစံ (၁)-၆',
      sex: true,
      rows: [
        pair('အရှင်မွေးဦးရေ', 'hmis.aliveMale', 'hmis.aliveFemale'),
        pair('အသေမွေးဦးရေ', 'hmis.deadMale', 'hmis.deadFemale'),
        pair('အစိုးရဌာနတွင် အရှင်မွေး', 'hmis.publicAliveMale', 'hmis.publicAliveFemale'),
        pair('အစိုးရဌာနတွင် အသေမွေး', 'hmis.publicDeadMale', 'hmis.publicDeadFemale'),
        pair('ပုဂ္ဂလိကတွင် အရှင်မွေး', 'hmis.privateAliveMale', 'hmis.privateAliveFemale'),
        pair('ပုဂ္ဂလိကတွင် အသေမွေး', 'hmis.privateDeadMale', 'hmis.privateDeadFemale'),
        pair('ကျွမ်းကျင်သူနှင့် အရှင်မွေး', 'hmis.skilledAliveMale', 'hmis.skilledAliveFemale'),
        pair('ကျွမ်းကျင်သူနှင့် အသေမွေး', 'hmis.skilledDeadMale', 'hmis.skilledDeadFemale'),
        pair('လမစေ့အရှင်မွေး', 'hmis.pretermAliveMale', 'hmis.pretermAliveFemale'),
        pair('ကိုယ်အလေးချိန်မပြည့် အရှင်မွေး', 'hmis.lbwAliveMale', 'hmis.lbwAliveFemale'),
        pair('ကိုယ်အလေးချိန်မပြည့် အသေမွေး', 'hmis.lbwDeadMale', 'hmis.lbwDeadFemale'),
        row('ကိုယ်ဝန်ပျက်သည့်ဦးရေ', 'hmis.abortion'),
        row('မွေးပြီး (၇) ရက်အတွင်း သေဆုံးသူကလေး', 'hmis.newbornDeathUnder7'),
        row('မွေးပြီး (၇) ရက်မှ (၂၈) ရက်အတွင်း သေဆုံးသူကလေး', 'hmis.newbornDeath7To28'),
        row('သားဖွားရောဂါကြောင့် သေဆုံးသူမိခင်', 'hmis.maternalDeathPregnancy'),
        row('အခြားရောဂါကြောင့် သေဆုံးသူမိခင်', 'hmis.maternalDeathOther'),
        row('ထိခိုက်မှု/မတော်တဆမှုကြောင့် သေဆုံးသူမိခင်', 'hmis.maternalDeathInjury')
      ]
    },
    { id: 'form-7', title: 'လချုပ်ပုံစံ (၁)-၇', rows: [], handwriting: 'ကျန်းမာရေးအသိပညာပေး' }
  ]

  function valueAt(metrics, path) {
    if (!path) return ''
    var value = String(path).split('.').reduce(function (current, key) {
      return current && Object.prototype.hasOwnProperty.call(current, key) ? current[key] : undefined
    }, metrics || {})
    var number = Number(value || 0)
    return Number.isFinite(number) && number > 0 ? String(number) : ''
  }

  function renderForms(metrics, facilityName) {
    return FORMS.map(function (form) {
      var body = form.rows.map(function (item) {
        if (item.malePath) {
          return '<tr><th scope="row">' + item.label + '</th>' +
            '<td>' + valueAt(metrics, item.malePath) + '</td>' +
            '<td>' + valueAt(metrics, item.femalePath) + '</td>' +
            '<td></td><td class="monthly-total">' +
            valueAt(metrics, item.malePath) + '</td><td class="monthly-total">' +
            valueAt(metrics, item.femalePath) + '</td></tr>'
        }
        var shown = valueAt(metrics, item.path)
        if (form.sex) {
          return '<tr><th scope="row">' + item.label + '</th><td colspan="2">' + shown +
            '</td><td></td><td colspan="2" class="monthly-total">' + shown + '</td></tr>'
        }
        return '<tr><th scope="row">' + item.label + '</th><td>' + shown +
          '</td><td></td><td></td><td class="monthly-total">' + shown + '</td></tr>'
      }).join('')
      if (!form.rows.length) {
        body = Array.from({ length: 8 }, function () {
          return '<tr><th></th><td></td><td></td><td></td><td></td></tr>'
        }).join('')
      }
      var head = form.sex
        ? '<tr><th>လုပ်ဆောင်ချက်</th><th colspan="2">' + facilityName + '</th><th></th><th colspan="2">စုစုပေါင်း</th></tr>' +
          '<tr><th></th><th>ကျား</th><th>မ</th><th></th><th>ကျား</th><th>မ</th></tr>'
        : '<tr><th>လုပ်ဆောင်ချက်</th><th>' + facilityName + '</th><th></th><th></th><th>စုစုပေါင်း</th></tr>'
      return '<section class="monthly-form" id="' + form.id + '"><h2>' + form.title + '</h2>' +
        (form.handwriting ? '<p class="monthly-handwrite">' + form.handwriting + ' — လက်ဖြင့်ဖြည့်ပါ</p>' : '') +
        '<table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></section>'
    }).join('')
  }

  global.MonthlyReport = { forms: FORMS, valueAt: valueAt, renderForms: renderForms }
})(typeof window !== 'undefined' ? window : globalThis)
