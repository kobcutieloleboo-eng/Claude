// Name pools by nationality, used to generate youth academy prospects ("regens")
// and squads for promoted clubs. Weighted toward nationalities common in English football.
const NAME_POOLS = {
  England: {
    w: 40,
    first: ["Harry","Jack","Oliver","George","Charlie","Alfie","Archie","Freddie","Theo","Mason","Kai","Reece","Callum","Lewis","Jayden","Tyler","Bobby","Finley","Riley","Ronnie","Jude","Cole","Ethan","Louie","Albie"],
    last: ["Smith","Jones","Taylor","Brown","Williams","Wilson","Johnson","Davies","Robinson","Wright","Thompson","Walker","White","Edwards","Hughes","Green","Hall","Wood","Harris","Clarke","Baker","Turner","Carter","Mitchell","Cooper","Bell","Ward","Parker","Gray","Shaw"]
  },
  Scotland: { w: 5, first: ["Callum","Lewis","Angus","Fraser","Rory","Finlay","Euan","Hamish","Blair","Cameron","Kieran","Ross"], last: ["MacDonald","Campbell","Stewart","McGregor","Ferguson","Robertson","Munro","Fraser","Douglas","Sinclair","McLean","Boyd"] },
  Wales: { w: 4, first: ["Dylan","Rhys","Osian","Ieuan","Gethin","Aled","Tomos","Cai","Morgan","Owain","Evan","Harri"], last: ["Jones","Davies","Evans","Williams","Thomas","Roberts","Lewis","Hughes","Morgan","Griffiths","Rees","Owen"] },
  Ireland: { w: 5, first: ["Conor","Sean","Cian","Darragh","Fionn","Oisin","Liam","Cathal","Eoin","Padraig","Ronan","Shane"], last: ["Murphy","Kelly","O'Sullivan","Walsh","O'Brien","Byrne","Ryan","O'Connor","Doyle","McCarthy","Gallagher","Kennedy"] },
  France: { w: 8, first: ["Kylian","Théo","Enzo","Hugo","Mathis","Rayan","Ibrahima","Moussa","Yanis","Lucas","Amine","Noah","Elyes","Sofiane","Aurélien"], last: ["Diallo","Traoré","Martin","Bernard","Dubois","Moreau","Fofana","Cissé","Camara","Mendy","Lefebvre","Girard","Kanté","Sylla","Doucouré"] },
  Spain: { w: 6, first: ["Pablo","Álvaro","Iker","Marco","Adrián","Sergio","Hugo","Daniel","Nico","Izan","Mateo","Rodri"], last: ["García","Fernández","López","Martínez","Sánchez","Pérez","Gómez","Torres","Navarro","Ruiz","Moreno","Ortega"] },
  Germany: { w: 5, first: ["Leon","Finn","Jonas","Luca","Paul","Noah","Felix","Maximilian","Elias","Tim","Jamal","Emre"], last: ["Müller","Schmidt","Schneider","Fischer","Weber","Wagner","Becker","Hoffmann","Koch","Richter","Wolf","Neumann"] },
  Netherlands: { w: 5, first: ["Daan","Sem","Luuk","Jesse","Thijs","Lars","Milan","Ruben","Sven","Bram","Xavi","Joep"], last: ["de Jong","van Dijk","Bakker","Visser","de Vries","van den Berg","Jansen","Smit","Meijer","Kuipers","Vermeulen","de Boer"] },
  Portugal: { w: 5, first: ["João","Diogo","Tiago","Gonçalo","Afonso","Rodrigo","Martim","Tomás","Duarte","Francisco","Rafael","Vasco"], last: ["Silva","Santos","Ferreira","Pereira","Oliveira","Costa","Rodrigues","Martins","Sousa","Fonseca","Carvalho","Neves"] },
  Brazil: { w: 8, first: ["Gabriel","Matheus","João","Lucas","Pedro","Vinícius","Kaio","Endrick","Igor","Thiago","Luan","Wesley","Caio","Éder","Murilo"], last: ["Silva","Santos","Oliveira","Souza","Lima","Costa","Pereira","Almeida","Nascimento","Araújo","Ribeiro","Barbosa","Cardoso","Rocha","Moraes"] },
  Argentina: { w: 5, first: ["Mateo","Thiago","Valentín","Santiago","Joaquín","Franco","Lautaro","Nicolás","Bruno","Facundo","Julián","Tomás"], last: ["González","Rodríguez","Fernández","López","Martínez","Díaz","Romero","Álvarez","Torres","Molina","Acuña","Paredes"] },
  Italy: { w: 4, first: ["Lorenzo","Alessandro","Francesco","Matteo","Leonardo","Riccardo","Tommaso","Gabriele","Davide","Andrea","Nicolò","Pietro"], last: ["Rossi","Russo","Ferrari","Esposito","Bianchi","Romano","Colombo","Ricci","Marino","Greco","Conti","Gallo"] },
  Belgium: { w: 4, first: ["Lucas","Arthur","Noah","Louis","Victor","Jules","Milan","Thibault","Maxime","Senne","Lars","Kobe"], last: ["Peeters","Janssens","Maes","Jacobs","Mertens","Willems","Claes","Wouters","De Smet","Dubois","Lambert","Vermeersch"] },
  Denmark: { w: 3, first: ["William","Oscar","Malthe","Emil","Magnus","Frederik","Mikkel","Rasmus","Anders","Victor","Oliver","Gustav"], last: ["Nielsen","Jensen","Hansen","Pedersen","Andersen","Christensen","Larsen","Sørensen","Rasmussen","Jørgensen","Madsen","Kristensen"] },
  Sweden: { w: 3, first: ["Hugo","Elias","Liam","Oscar","Viktor","Ludvig","Anton","Isak","Melker","Nils","Alexander","Filip"], last: ["Andersson","Johansson","Karlsson","Nilsson","Eriksson","Larsson","Olsson","Persson","Svensson","Gustafsson","Lindberg","Bergström"] },
  Norway: { w: 3, first: ["Jakob","Emil","Noah","Oliver","William","Filip","Sander","Magnus","Henrik","Theodor","Aksel","Sondre"], last: ["Hansen","Johansen","Olsen","Larsen","Andersen","Pedersen","Nilsen","Kristiansen","Jensen","Karlsen","Berg","Haaland"] },
  Nigeria: { w: 5, first: ["Chukwudi","Emeka","Oluwaseun","Ifeanyi","Kelechi","Tobi","Samuel","Victor","Chidera","Ayo","Nnamdi","David"], last: ["Okafor","Adeyemi","Okonkwo","Eze","Balogun","Adebayo","Chukwu","Obi","Nwankwo","Olawale","Uche","Ibrahim"] },
  Ghana: { w: 4, first: ["Kwame","Kofi","Kwesi","Yaw","Kojo","Abdul","Ibrahim","Daniel","Prince","Emmanuel","Michael","Joseph"], last: ["Mensah","Owusu","Boateng","Asante","Appiah","Osei","Agyemang","Amoah","Ansah","Darko","Tetteh","Acheampong"] },
  Senegal: { w: 4, first: ["Mamadou","Ousmane","Ibrahima","Cheikh","Moussa","Abdoulaye","Pape","Sadio","Idrissa","Alioune","Babacar","Serigne"], last: ["Diop","Ndiaye","Fall","Gueye","Diallo","Sarr","Sy","Faye","Cissé","Mbaye","Niang","Kane"] },
  "Ivory Coast": { w: 3, first: ["Yaya","Didier","Seydou","Franck","Wilfried","Serge","Amad","Ismaël","Odilon","Jean","Eric","Maxwel"], last: ["Kouassi","Koné","Touré","Bamba","Ouattara","Coulibaly","Kessié","Doumbia","Gervinho","Zaha","Fofana","Diomandé"] },
  Morocco: { w: 3, first: ["Achraf","Youssef","Amine","Hakim","Sofyan","Ayoub","Zakaria","Ismail","Bilal","Anas","Hamza","Reda"], last: ["El Idrissi","Benali","Amrabat","Ziyech","El Khannouss","Mazraoui","Hakimi","Saibari","Ounahi","Aguerd","Bounou","Ezzalzouli"] },
  Japan: { w: 3, first: ["Haruto","Yuto","Sota","Riku","Kaito","Takumi","Ren","Daichi","Kaoru","Wataru","Ritsu","Ao"], last: ["Sato","Suzuki","Takahashi","Tanaka","Watanabe","Ito","Yamamoto","Nakamura","Kobayashi","Kato","Endo","Mitoma"] },
  USA: { w: 3, first: ["Christian","Tyler","Brandon","Gio","Weston","Malik","Josh","Caleb","Jordan","Austin","Cade","Diego"], last: ["Johnson","Miller","Davis","Garcia","Martinez","Anderson","Thomas","Jackson","Harris","Clark","Lewis","Reyna"] },
  Serbia: { w: 2, first: ["Luka","Nikola","Stefan","Marko","Dušan","Lazar","Aleksandar","Filip","Vuk","Petar","Uroš","Mihajlo"], last: ["Jovanović","Petrović","Nikolić","Marković","Đorđević","Stojanović","Ilić","Pavlović","Milinković","Kostić","Vlahović","Mitrović"] },
  Croatia: { w: 2, first: ["Luka","Ivan","Marko","Ante","Josip","Mateo","Niko","Petar","Karlo","Fran","Lovro","Bruno"], last: ["Horvat","Kovačević","Babić","Marić","Jurić","Novak","Kovačić","Perišić","Brozović","Modrić","Vidović","Šarić"] },
  Poland: { w: 2, first: ["Jakub","Kacper","Antoni","Szymon","Filip","Mikołaj","Wojciech","Bartosz","Piotr","Michał","Igor","Dawid"], last: ["Nowak","Kowalski","Wiśniewski","Wójcik","Kowalczyk","Kamiński","Lewandowski","Zieliński","Szymański","Woźniak","Kaczmarek","Mazur"] },
  Uruguay: { w: 2, first: ["Santiago","Mateo","Facundo","Agustín","Bruno","Felipe","Diego","Nicolás","Federico","Manuel","Darwin","Rodrigo"], last: ["Pérez","Rodríguez","González","Fernández","Núñez","Silva","Suárez","Cáceres","Olivera","Araújo","Valverde","Bentancur"] },
  Colombia: { w: 2, first: ["Santiago","Juan","Sebastián","Camilo","Andrés","Daniel","Luis","Yerson","Jhon","Miguel","Kevin","Duván"], last: ["Rodríguez","Martínez","García","López","Díaz","Muñoz","Sánchez","Torres","Córdoba","Mosquera","Rojas","Quintero"] },
};

const NATIONALITIES = Object.keys(NAME_POOLS);
const NAT_WEIGHT_TOTAL = NATIONALITIES.reduce((s, n) => s + NAME_POOLS[n].w, 0);

function randomNationality(rng) {
  let r = rng() * NAT_WEIGHT_TOTAL;
  for (const n of NATIONALITIES) {
    r -= NAME_POOLS[n].w;
    if (r <= 0) return n;
  }
  return "England";
}

function randomName(natl, rng) {
  const pool = NAME_POOLS[natl] || NAME_POOLS.England;
  const f = pool.first[Math.floor(rng() * pool.first.length)];
  const l = pool.last[Math.floor(rng() * pool.last.length)];
  return f + " " + l;
}

if (typeof module !== "undefined") module.exports = { NAME_POOLS, randomNationality, randomName };
