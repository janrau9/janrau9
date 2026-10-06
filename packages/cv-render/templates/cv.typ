// General CV. All data arrives as JSON in sys.inputs.data, already selected and
// ordered by buildCvDocument(); this file only lays it out.
// Single column, real text, no icons: applicant tracking systems read it top to bottom.

#let d = json(bytes(sys.inputs.data))

#let ink = rgb("#211e19")
#let text2 = rgb("#5a554d")
#let text3 = rgb("#767066")
#let line = rgb("#d2cec6")

#set document(title: d.name + " — CV", author: d.name)
#set page(paper: "a4", margin: (x: 18mm, top: 16mm, bottom: 16mm))
#set text(font: "Geist", size: 9.5pt, fill: ink, lang: "en")
#set par(leading: 0.62em, spacing: 0.9em)
#set list(indent: 0pt, body-indent: 6pt, spacing: 0.55em, marker: text(fill: text3)[–])

#let micro(body) = text(font: "Geist Mono", size: 7.5pt, fill: text3, body)

#let section(title) = {
  v(10pt)
  block(below: 6pt, {
    text(weight: 600, size: 10.5pt, title)
    v(-6pt)
    std.line(length: 100%, stroke: 0.5pt + line)
  })
}

#let entry(left, right, sub: none) = {
  grid(
    columns: (1fr, auto),
    column-gutter: 12pt,
    text(weight: 600, left),
    micro(right),
  )
  if sub != none { v(-4pt); text(fill: text2, sub) }
}

// Header
#text(size: 20pt, weight: 600, tracking: -0.02em, d.name)
#v(-8pt)
#text(size: 11pt, fill: text2, d.headline)
#v(2pt)
#micro({
  let items = (d.contact.location, d.contact.email)
  if "phone" in d.contact { items.push(d.contact.phone) }
  items.join("  ·  ")
})
#v(-4pt)
#micro((d.contact.site, d.contact.github, d.contact.linkedin).join("  ·  "))
#v(-4pt)
#micro(d.facts.join("  ·  "))

#v(4pt)
#text(fill: text2, d.about)

#if "coverNote" in d [
  #section[Why #d.coverNote.company]
  #for p in d.coverNote.paragraphs [ #p #parbreak() ]
]

#section[Experience]
#for e in d.experience {
  entry(e.role + ", " + e.org, e.period, sub: e.location)
  list(..e.highlights)
  v(4pt)
}

#section[Projects]
#for p in d.projects {
  entry(p.name, p.status, sub: p.summary)
  if p.highlights.len() > 0 { list(..p.highlights) }
  micro(p.stack)
  v(4pt)
}

#section[Education]
#for e in d.education {
  entry(e.programme, e.period, sub: e.org)
  v(2pt)
}

#if d.awards.len() > 0 [
  #section[Recognition]
  #list(..d.awards)
]

#if d.licenses.len() > 0 [
  #section[Licences]
  #list(..d.licenses)
]

#section[Skills]
#d.skills.join("  ·  ")
