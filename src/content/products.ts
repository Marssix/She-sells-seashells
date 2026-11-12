export interface Product {
  id: string;
  name: string;
  /** Lyhyt, rehellinen kuvaus siitä, mitä tuote oikeasti on. */
  description: string;
  /** Tuotteen todellinen arvo euroina. */
  trueValueEur: number;
  /** 1 = vähän absurdi, 3 = täysin absurdi. Vaikuttaa pistekertoimeen. */
  absurdity: 1 | 2 | 3;
}

export const products: Product[] = [
  { id: "hammasharja", name: "Käytetty hammasharja", description: "Sähköhammasharja ilman laturia, harjakset levällään.", trueValueEur: 0.5, absurdity: 3 },
  { id: "pilvi-nft", name: "NFT pilvestä", description: "Kuvakaappaus pilvestä, jonka 'omistusoikeus' on kirjattu tekstitiedostoon.", trueValueEur: 0, absurdity: 3 },
  { id: "ikea-ohje", name: "Puolikas IKEA-ohje", description: "Sivut 1–6 kirjahyllyn kokoamisohjeesta. Hylly puuttuu.", trueValueEur: 0.1, absurdity: 3 },
  { id: "ilmapurkki", name: "Purkillinen Lapin ilmaa", description: "Tyhjä hillopurkki, jossa lukee tussilla 'LAPPI'.", trueValueEur: 0.3, absurdity: 3 },
  { id: "kivi", name: "Lemmikkikivi", description: "Tavallinen pihakivi, johon on liimattu muoviset silmät.", trueValueEur: 0.2, absurdity: 2 },
  { id: "kaukosaadin", name: "Kaukosäädin ilman telkkaria", description: "Kaukosäädin vuoden 2004 televisioon, jota ei enää ole.", trueValueEur: 1, absurdity: 2 },
  { id: "villasukka", name: "Yksi villasukka", description: "Vasen villasukka. Pari katosi pesukoneeseen.", trueValueEur: 2, absurdity: 2 },
  { id: "faksi", name: "Faksilaite", description: "Toimiva faksi. Kukaan ei omista enää toista faksia.", trueValueEur: 5, absurdity: 2 },
  { id: "kalenteri-2019", name: "Seinäkalenteri vuodelle 2019", description: "Kissakuvat, hyvässä kunnossa. Päivämäärät vanhentuneita.", trueValueEur: 0.5, absurdity: 2 },
  { id: "ruuvimeisseli", name: "Ruuvimeisseli ilman kärkeä", description: "Pelkkä kahva. Kärki hävisi vuonna 2011.", trueValueEur: 0.2, absurdity: 3 },
  { id: "kasetti", name: "C-kasetti 'Kesähitit 1997'", description: "Itse äänitetty radiosta. Juontajan puhetta kappaleiden päällä.", trueValueEur: 1, absurdity: 1 },
  { id: "kuntopyora", name: "Kuntopyörä", description: "Toimiva kuntopyörä, jota on käytetty pääasiassa vaatenaulakkona.", trueValueEur: 40, absurdity: 1 },
  { id: "jaakaappimagneetti", name: "Jääkaappimagneetti 'Kanarian saaret'", description: "Hieman haalistunut. Ei ole koskaan ollut Kanarialla.", trueValueEur: 0.5, absurdity: 1 },
  { id: "tyhja-pullo", name: "Tyhjä vesipullo", description: "Muovinen 0,5 l pullo. Panttiarvo 0,10 €.", trueValueEur: 0.1, absurdity: 2 },
  { id: "salasana", name: "Wifi-salasana", description: "Lappu, jossa on naapurin vanha wifi-salasana. Ei toimi enää.", trueValueEur: 0, absurdity: 3 },
  { id: "kolikko", name: "Taskusta löytynyt 2 sentin kolikko", description: "Tavallinen 2 sentin kolikko vuodelta 2008.", trueValueEur: 0.02, absurdity: 2 },
  { id: "lumiukko", name: "Kesäksi säilötty lumiukko", description: "Pakastepussi, jossa on vettä ja porkkana.", trueValueEur: 0.3, absurdity: 3 },
  { id: "kirja", name: "Kirja 'Opi Windows 98'", description: "Opaskirja, 700 sivua. Muutama sivu kahvitahrainen.", trueValueEur: 1, absurdity: 1 },
  { id: "toimistotuoli", name: "Narahtava toimistotuoli", description: "Toimistotuoli, jonka korkeussäätö laskee itsestään.", trueValueEur: 15, absurdity: 1 },
  { id: "sateenvarjo", name: "Rikkinäinen sateenvarjo", description: "Kaksi ruotoa katki. Aukeaa vain puoliksi.", trueValueEur: 1, absurdity: 1 },
  { id: "kurssi", name: "Verkkokurssi 'Miten tehdä verkkokurssi'", description: "Yksi 4 minuutin video ja PDF, jossa on kolme bullet pointia.", trueValueEur: 0, absurdity: 3 },
  { id: "kaktus", name: "Muovikaktus", description: "Ei tarvitse kastelua. Pölyttynyt.", trueValueEur: 2, absurdity: 1 },
  { id: "ennustus", name: "Huomisen sääennuste", description: "Kirjoitettu lappu: 'Huomenna voi sataa tai sitten ei.'", trueValueEur: 0, absurdity: 3 },
  { id: "palapeli", name: "Palapeli (999/1000 palaa)", description: "1000 palan maisemapalapeli. Yksi pala puuttuu, keskeltä.", trueValueEur: 3, absurdity: 1 },
  { id: "kuulokkeet", name: "Kuulokkeet, toinen puoli toimii", description: "Langalliset kuulokkeet. Vasen kuuloke rätisee.", trueValueEur: 2, absurdity: 1 },
  { id: "varjo", name: "Oma varjo (käytetty)", description: "Myyjän oma varjo. Toimitus aurinkoisella säällä.", trueValueEur: 0, absurdity: 3 },
  { id: "matkalaukku", name: "Matkalaukku ilman pyöriä", description: "Iso matkalaukku. Pyörät irtosivat Kreikan-matkalla.", trueValueEur: 8, absurdity: 1 },
  { id: "lottokuponki", name: "Viime viikon lottokuponki", description: "Arvottu jo. Ei voittoa. Numerot kuitenkin 'tuntuivat hyviltä'.", trueValueEur: 0, absurdity: 3 },
  { id: "kahvinkeitin", name: "Kahvinkeitin ilman kannua", description: "Keitin toimii, mutta kahvi valuu suoraan pöydälle.", trueValueEur: 4, absurdity: 2 },
  { id: "mokki-osuus", name: "1/365 osuus mökistä", description: "Oikeus käyttää kesämökkiä 29. helmikuuta.", trueValueEur: 10, absurdity: 2 },
];

export function getProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}
