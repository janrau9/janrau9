// Cover letter. Data arrives as JSON in sys.inputs.data; the paragraphs are the
// variant's validated cover note, so the letter can't claim more than the CV.

#let d = json(bytes(sys.inputs.data))
#let ink = rgb("#211e19")
#let text2 = rgb("#5a554d")
#let text3 = rgb("#767066")

#set document(title: d.name + " — cover letter, " + d.company, author: d.name)
#set page(paper: "a4", margin: (x: 24mm, top: 22mm, bottom: 22mm))
#set text(font: "Geist", size: 10.5pt, fill: ink, lang: "en")
#set par(leading: 0.75em, spacing: 1.3em)

#let micro(body) = text(font: "Geist Mono", size: 8pt, fill: text3, body)

#text(size: 18pt, weight: 600, tracking: -0.02em, d.name)
#v(-6pt)
#text(fill: text2, d.headline)
#v(-2pt)
#micro(d.contact.join("  ·  "))

#v(18pt)
#micro(d.date)
#v(-2pt)
#text(weight: 600, d.company) — #d.role

#v(10pt)
Dear #d.company hiring team,

#for p in d.paragraphs [ #p #parbreak() ]

#d.closing

#v(6pt)
Best regards, \
#d.name
