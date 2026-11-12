# Tietosuojaseloste – Kaupitse Botille

**Voimassa 12.11.2026 alkaen**

Tämä seloste kertoo, mitä tietoja Discord-botti **Kaupitse Botille** ("botti", "me") käsittelee, miksi ja kenelle niitä luovutetaan. Botti on harrastusprojekti, jonka lähdekoodi on julkisesti nähtävissä: <https://github.com/Marssix/She-sells-seashells>.

## 1. Rekisterinpitäjä ja yhteystiedot
Rekisterinpitäjä on botin ylläpitäjä (GitHub-käyttäjä **Marssix**).
Tietosuoja-asioissa ota yhteyttä avaamalla issue osoitteessa <https://github.com/Marssix/She-sells-seashells/issues>. Älä kirjoita issueen henkilötietoja; pyydämme tarvittaessa yksityisen yhteydenottotavan.

## 2. Mitä tietoja käsittelemme

| Tieto | Mistä | Miksi |
|---|---|---|
| Discord-käyttäjätunnus (ID), käyttäjänimi ja palvelinkohtainen näyttönimi | Discord, kun käytät komentoa tai nappia | Pelin pyörittäminen: kuka myy, kenen vuoro on, nimi tulosviestissä |
| Palvelimen, kanavan ja ketjun tunnisteet | Discord | Pelin sitominen oikeaan ketjuun |
| Kirjoittamiesi viestien sisältö **pelisi ketjussa, pelin ollessa käynnissä** | Discord | Myyntipuheesi välitetään tekoälyostajalle, jotta se voi vastata |
| Komentojen ja nappien käyttö | Discord | Pelin toiminnot (aloitus, tarjouksen hyväksyminen, luovutus) |

**Muut viestit:** Botilla on Discordin *Message Content* -oikeus, jotta se voi lukea myyntipuheet. Discord toimittaa botille teknisesti myös muita viestejä kanavilta, joille botilla on pääsy. Botti ohittaa heti kaikki viestit, jotka eivät ole käynnissä olevan pelin myyjän viestejä pelin omassa ketjussa. Niitä ei tallenneta, lokiteta eikä lähetetä eteenpäin.

**Emme kerää** sähköpostiosoitteita, maksutietoja, sijaintitietoja emmekä muita tietoja kuin yllä luetellut.

### Äänitila (ei vielä käytössä)
Botin suunnitteilla oleva äänitila kuuntelisi pelaajan puhetta äänikanavalla ja muuttaisi sen tekstiksi. Päivitämme tämän selosteen ja kerromme äänen käsittelystä ennen kuin toiminto otetaan käyttöön. Periaatteena on, että ääntä ei tallenneta.

## 3. Käsittelyn oikeusperuste
Käsittely perustuu **oikeutettuun etuun** (EU:n yleinen tietosuoja-asetus, art. 6(1)(f)): tietoja tarvitaan, jotta voimme tarjota pelin, jonka itse käynnistät. Käsittelemme vain sen, mikä on pelin toiminnan kannalta välttämätöntä.

## 4. Kenelle tietoja luovutetaan
- **Anthropic (Claude API):** tekoälyostajan vastaukset tuotetaan Anthropicin Claude-mallilla. Anthropicille lähetetään **myyntipuheesi teksti** ja pelin tila (esim. ostajahahmo, tuote ja mittarien arvot). Discord-tunnuksiasi tai nimeäsi **ei** lähetetä. Anthropic ei oletuksena käytä API:n kautta lähetettyä dataa mallien kouluttamiseen. Lue lisää: <https://www.anthropic.com/legal/privacy>.
- **Discord:** kaikki pelin viestit kulkevat Discordin kautta, ja Discord käsittelee niitä omien ehtojensa mukaisesti: <https://discord.com/privacy>.
- **Palvelinympäristö:** botti ajetaan ylläpitäjän koneella tai pilvipalvelimella, jonka palveluntarjoaja voi teknisesti käsitellä botin lokitietoja.

Emme myy tietoja emmekä käytä niitä mainontaan.

## 5. Tietojen siirto EU:n ulkopuolelle
Anthropic ja Discord käsittelevät tietoja myös Yhdysvalloissa. Siirrot perustuvat palveluntarjoajien käyttämiin EU:n hyväksymiin siirtomekanismeihin, kuten EU–US Data Privacy Framework -järjestelyyn ja EU-komission vakiosopimuslausekkeisiin.

## 6. Kuinka kauan tietoja säilytetään
- **Pelin tila ja keskusteluhistoria** ovat vain botin muistissa, ja ne poistetaan, kun peli päättyy tai botti käynnistetään uudelleen. Botti ei tällä hetkellä tallenna mitään pysyvään tietokantaan.
- **Viestit Discordissa:** pelin ketju ja viestit jäävät Discordiin palvelimesi asetusten mukaisesti. Voit poistaa omat viestisi Discordissa milloin tahansa.
- **Tekniset lokit** voivat sisältää näyttönimesi, valitun ostajan, pelin lopputuloksen ja virheilmoituksia. Lokeja säilytetään enintään 30 päivää vianetsintää varten.
- **Anthropic** säilyttää API-pyyntöjä omien käytäntöjensä mukaisesti (ks. kohta 4).

### Tulevat pistetaulukot
Jos botti saa myöhemmin pysyvät profiilit ja pistetaulukot, tallennamme niihin Discord-tunnuksesi ja pelitilastosi. Päivitämme tämän selosteen ennen kuin toiminto otetaan käyttöön.

## 7. Oikeutesi
Sinulla on EU:n tietosuoja-asetuksen mukaan oikeus:
- saada tietää, mitä tietoja sinusta käsitellään
- pyytää tietojen oikaisemista tai poistamista
- vastustaa tietojen käsittelyä
- tehdä valitus valvontaviranomaiselle. Suomessa se on tietosuojavaltuutetun toimisto: <https://tietosuoja.fi>.

Koska botti ei tallenna tietoja pysyvästi, useimmissa tapauksissa sinusta ei ole tallessa mitään poistettavaa. Ota yhteyttä kohdan 1 mukaisesti. Voit myös lopettaa käsittelyn kokonaan lopettamalla botin käytön. Palvelimen ylläpitäjä voi poistaa botin palvelimelta.

## 8. Ikäraja
Botti on tarkoitettu Discordin käyttäjille, ja Discordin ikärajat koskevat myös sitä. Alaikäraja on vähintään 13 vuotta, ja joissain maissa se on korkeampi.

## 9. Tietoturva
Tietoja säilytetään vain niin kauan kuin peli on käynnissä. API-avaimet säilytetään erillään lähdekoodista. Yhteydet Discordiin ja Anthropicille ovat salattuja (HTTPS/TLS).

## 10. Muutokset
Voimme päivittää tätä selostetta, esimerkiksi kun botti saa uusia ominaisuuksia. Muutokset ja niiden historia näkyvät tämän tiedoston versiohistoriassa GitHubissa. Merkittävistä muutoksista kerromme ennen kuin ne tulevat voimaan.
