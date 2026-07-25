// Real-world honours, keyed by the calendar year the season FINISHED
// (e.g. 2008 = the 2007-08 season). Used to pre-fill the record books for
// every season before your chosen start, and to give players their real
// career honours on their profile page.

const PRE_AWARDS = {
  // Ballon d'Or winners (2020 not awarded)
  bdor: {
    2000: "Luís Figo", 2001: "Michael Owen", 2002: "Ronaldo Nazário", 2003: "Pavel Nedvěd",
    2004: "Andriy Shevchenko", 2005: "Ronaldinho", 2006: "Fabio Cannavaro", 2007: "Kaká",
    2008: "Cristiano Ronaldo", 2009: "Lionel Messi", 2010: "Lionel Messi", 2011: "Lionel Messi",
    2012: "Lionel Messi", 2013: "Cristiano Ronaldo", 2014: "Cristiano Ronaldo", 2015: "Lionel Messi",
    2016: "Cristiano Ronaldo", 2017: "Cristiano Ronaldo", 2018: "Luka Modrić", 2019: "Lionel Messi",
    2021: "Lionel Messi", 2022: "Karim Benzema", 2023: "Lionel Messi", 2024: "Rodri",
    2025: "Ousmane Dembélé",
  },
  // European Golden Boot (Golden Shoe)
  boot: {
    2000: "Kevin Phillips", 2001: "Henrik Larsson", 2002: "Mário Jardel", 2003: "Roy Makaay",
    2004: "Thierry Henry", 2005: "Thierry Henry & Diego Forlán", 2006: "Luca Toni",
    2007: "Francesco Totti", 2008: "Cristiano Ronaldo", 2009: "Diego Forlán", 2010: "Lionel Messi",
    2011: "Cristiano Ronaldo", 2012: "Lionel Messi", 2013: "Lionel Messi",
    2014: "Luis Suárez & Cristiano Ronaldo", 2015: "Cristiano Ronaldo", 2016: "Luis Suárez",
    2017: "Lionel Messi", 2018: "Lionel Messi", 2019: "Lionel Messi", 2020: "Ciro Immobile",
    2021: "Robert Lewandowski", 2022: "Robert Lewandowski", 2023: "Erling Haaland",
    2024: "Harry Kane", 2025: "Kylian Mbappé",
  },
  // Champions League winners (club abbrevs)
  cl: {
    2000: "RMA", 2001: "BAY", 2002: "RMA", 2003: "MIL", 2004: "POR", 2005: "LIV", 2006: "BAR",
    2007: "MIL", 2008: "MUN", 2009: "BAR", 2010: "INT", 2011: "BAR", 2012: "CHE", 2013: "BAY",
    2014: "RMA", 2015: "BAR", 2016: "RMA", 2017: "RMA", 2018: "RMA", 2019: "LIV", 2020: "BAY",
    2021: "CHE", 2022: "RMA", 2023: "MCI", 2024: "RMA", 2025: "PSG",
  },
  // League champions (club abbrevs)
  champs: {
    EPL: { 2000: "MUN", 2001: "MUN", 2002: "ARS", 2003: "MUN", 2004: "ARS", 2005: "CHE", 2006: "CHE", 2007: "MUN", 2008: "MUN", 2009: "MUN", 2010: "CHE", 2011: "MUN", 2012: "MCI", 2013: "MUN", 2014: "MCI", 2015: "CHE", 2016: "LEI", 2017: "CHE", 2018: "MCI", 2019: "MCI", 2020: "LIV", 2021: "MCI", 2022: "MCI", 2023: "MCI", 2024: "MCI", 2025: "LIV" },
    LIGA: { 2000: "DEP", 2001: "RMA", 2002: "VAL", 2003: "RMA", 2004: "VAL", 2005: "BAR", 2006: "BAR", 2007: "RMA", 2008: "RMA", 2009: "BAR", 2010: "BAR", 2011: "BAR", 2012: "RMA", 2013: "BAR", 2014: "ATM", 2015: "BAR", 2016: "BAR", 2017: "RMA", 2018: "BAR", 2019: "BAR", 2020: "RMA", 2021: "ATM", 2022: "RMA", 2023: "BAR", 2024: "RMA", 2025: "BAR" },
    SA: { 2000: "LAZ", 2001: "ROM", 2002: "JUV", 2003: "JUV", 2004: "MIL", 2005: "JUV", 2006: "INT", 2007: "INT", 2008: "INT", 2009: "INT", 2010: "INT", 2011: "MIL", 2012: "JUV", 2013: "JUV", 2014: "JUV", 2015: "JUV", 2016: "JUV", 2017: "JUV", 2018: "JUV", 2019: "JUV", 2020: "JUV", 2021: "INT", 2022: "MIL", 2023: "NAP", 2024: "INT", 2025: "NAP" },
    BL: { 2000: "BAY", 2001: "BAY", 2002: "BVB", 2003: "BAY", 2004: "SVW", 2005: "BAY", 2006: "BAY", 2007: "STU", 2008: "BAY", 2009: "WOB", 2010: "BAY", 2011: "BVB", 2012: "BVB", 2013: "BAY", 2014: "BAY", 2015: "BAY", 2016: "BAY", 2017: "BAY", 2018: "BAY", 2019: "BAY", 2020: "BAY", 2021: "BAY", 2022: "BAY", 2023: "BAY", 2024: "LEV", 2025: "BAY" },
    L1: { 2000: "MON", 2001: "NAN", 2002: "LYO", 2003: "LYO", 2004: "LYO", 2005: "LYO", 2006: "LYO", 2007: "LYO", 2008: "LYO", 2009: "GDB", 2010: "MAR", 2011: "LIL", 2012: "MHSC", 2013: "PSG", 2014: "PSG", 2015: "PSG", 2016: "PSG", 2017: "MON", 2018: "PSG", 2019: "PSG", 2020: "PSG", 2021: "LIL", 2022: "PSG", 2023: "PSG", 2024: "PSG", 2025: "PSG" },
  },
};

// Real international tournament winners (year the final was played, nation).
// Used to give real players past international honours before the save starts,
// and to seed the internationals record book.
const INTL_WINNERS = [
  { year: 2000, comp: "Euros", scope: "EU", winner: "France" },
  { year: 2001, comp: "Copa América", scope: "SA", winner: "Colombia" },
  { year: 2002, comp: "World Cup", scope: "WORLD", winner: "Brazil" },
  { year: 2004, comp: "Euros", scope: "EU", winner: "Greece" },
  { year: 2004, comp: "Copa América", scope: "SA", winner: "Brazil" },
  { year: 2006, comp: "World Cup", scope: "WORLD", winner: "Italy" },
  { year: 2007, comp: "Copa América", scope: "SA", winner: "Brazil" },
  { year: 2008, comp: "Euros", scope: "EU", winner: "Spain" },
  { year: 2010, comp: "World Cup", scope: "WORLD", winner: "Spain" },
  { year: 2011, comp: "Copa América", scope: "SA", winner: "Uruguay" },
  { year: 2012, comp: "Euros", scope: "EU", winner: "Spain" },
  { year: 2014, comp: "World Cup", scope: "WORLD", winner: "Germany" },
  { year: 2015, comp: "Copa América", scope: "SA", winner: "Chile" },
  { year: 2016, comp: "Euros", scope: "EU", winner: "Portugal" },
  { year: 2016, comp: "Copa América", scope: "SA", winner: "Chile" },
  { year: 2018, comp: "World Cup", scope: "WORLD", winner: "France" },
  { year: 2019, comp: "Copa América", scope: "SA", winner: "Brazil" },
  { year: 2021, comp: "Euros", scope: "EU", winner: "Italy" },
  { year: 2021, comp: "Copa América", scope: "SA", winner: "Argentina" },
  { year: 2022, comp: "World Cup", scope: "WORLD", winner: "Argentina" },
  { year: 2024, comp: "Euros", scope: "EU", winner: "Spain" },
  { year: 2024, comp: "Copa América", scope: "SA", winner: "Argentina" },
];

if (typeof module !== "undefined") module.exports = { PRE_AWARDS, INTL_WINNERS };
