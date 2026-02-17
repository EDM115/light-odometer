const VALUE_HTML: string = "<span class=\"odometer-value\"></span>"

const RIBBON_HTML: string
  = "<span class=\"odometer-ribbon\"><span class=\"odometer-ribbon-inner\">"
    + VALUE_HTML
    + "</span></span>"

const DIGIT_HTML: string
  = "<span class=\"odometer-digit\"><span class=\"odometer-digit-spacer\">8</span><span class=\"odometer-digit-inner\">"
    + RIBBON_HTML
    + "</span></span>"

const FORMAT_MARK_HTML: string = "<span class=\"odometer-formatting-mark\"></span>"

export {
  DIGIT_HTML,
  FORMAT_MARK_HTML,
  RIBBON_HTML,
  VALUE_HTML,
}
