/* Gestion des restaurants et cafétérias CROUS de Clermont-Ferrand (UCA).
   Fournit les menus du jour et de la semaine, les horaires réels, l'affluence en direct
   et l'affichage des informations nutritionnelles et tarifs étudiants (1€ / 3.30€). */
(function (root) {
  "use strict";

  const CROUS_RESTOS = [
    {
      id: "cezeaux",
      nom: "Resto U Marie-Hélène Lafon (Cézeaux)",
      campus: "Campus Cézeaux · Aubière",
      adresse: "27 Avenue Blaise Pascal, 63170 Aubière",
      type: "resto",
      horairesMidi: "11h30 - 14h00",
      horairesSoir: "18h45 - 20h30 (fermé vendredi soir)",
      ouvertMidi: true,
      ouvertSoir: true,
      capacite: 950,
      affluenceActuelle: 68, // en %
      menus: {
        lundi: {
          entrees: ["Salade piémontaise maison", "Carottes râpées bio au citron", "Soupe veloutée de potimarron"],
          plats: [
            { nom: "Pavé de colin d'Alaska sauce oseille & citron", type: "poisson", label: "Pêche durable" },
            { nom: "Sauté de volaille fermière d'Auvergne aux champignons", type: "viande", label: "Origine France" },
            { nom: "Chili sin carne aux haricots rouges et maïs doux", type: "vege", label: "Végétarien Bio" }
          ],
          accompagnements: ["Riz basmati parfumé", "Poêlée campagnarde de légumes", "Frites au four"],
          desserts: ["Mousse au chocolat noir maison", "Compote pomme-poire bio", "Faisselle d'Auvergne au coulis de fruits", "Fruit de saison bio"]
        },
        mardi: {
          entrees: ["Salade grecque (fêta, concombres, olives)", "Taboulé oriental à la menthe", "Velouté de carottes au cumin"],
          plats: [
            { nom: "Bœuf bourguignon mijoté aux carottes", type: "viande", label: "Viande Bovine Française" },
            { nom: "Filet de merlu blanc au coulis de tomates provençales", type: "poisson", label: "Pêche durable" },
            { nom: "Curry de pois chiches, patates douces & lait de coco", type: "vege", label: "Végétarien" }
          ],
          accompagnements: ["Penne rigate bio", "Haricots verts extra-fins persillés", "Purée de pommes de terre maison"],
          desserts: ["Tarte aux pommes rustique", "Crème dessert vanille Bourbon", "Fromage blanc fermier & miel", "Clémentines de Corse"]
        },
        mercredi: {
          entrees: ["Salade coleslaw maison", "Salade de lentilles vertes du Puy AOP", "Gaspacho andalou"],
          plats: [
            { nom: "Lasagnes bolognaises pur bœuf au parmesan", type: "viande", label: "Fait maison" },
            { nom: "Pavé de saumon grillé au fenouil", type: "poisson", label: "Label Rouge" },
            { nom: "Lasagnes végétariennes épinards & ricotta", type: "vege", label: "Végétarien" }
          ],
          accompagnements: ["Salade verte croquante", "Gratin de courgettes", "Riz pilaf aux petits légumes"],
          desserts: ["Île flottante caramel beurre salé", "Pomme bio du Limousin", "Yaourt brassé aux myrtilles", "Brownie aux noix"]
        },
        jeudi: {
          entrees: ["Betteraves bio en vinaigrette échalote", "Céleri rémoulade maison", "Salade de pâtes méditerranéenne"],
          plats: [
            { nom: "Rôti de dinde rôti au thym et jus réduit", type: "viande", label: "Volaille Française" },
            { nom: "Dos de cabillaud en croûte d'herbes", type: "poisson", label: "Pêche responsable" },
            { nom: "Dahl de lentilles corail au curry doux et épinards", type: "vege", label: "Végétarien Bio" }
          ],
          accompagnements: ["Frites fraîches maison", "Ratatouille niçoise", "Semoule fine complète"],
          desserts: ["Éclair au chocolat", "Fromage Cantal AOP & pain de campagne", "Poire rôtie aux épices", "Yaourt nature bio"]
        },
        vendredi: {
          entrees: ["Salade niçoise", "Carottes et chou blanc râpés bio", "Velouté de poireaux et pommes de terre"],
          plats: [
            { nom: "Fish & Chips croustillant sauce tartare", type: "poisson", label: "Poisson frais" },
            { nom: "Émincé de porc au caramel et graines de sésame", type: "viande", label: "Porc Français" },
            { nom: "Risotto crémeux aux champignons de Paris et parmesan", type: "vege", label: "Végétarien" }
          ],
          accompagnements: ["Riz thaï vapeur", "Julienne de légumes sautés au wok", "Petits pois à la française"],
          desserts: ["Tiramisu classique", "Salade de fruits frais maison", "Saint-Nectaire AOP fermier", "Yaourt à boire vanille"]
        }
      }
    },
    {
      id: "manege",
      nom: "Resto U Le Manège (Carnot)",
      campus: "Centre-ville Carnot · Droit & Éco",
      adresse: "11 Rue d'Amboise, 63000 Clermont-Ferrand",
      type: "resto",
      horairesMidi: "11h30 - 14h00",
      horairesSoir: "Fermé le soir",
      ouvertMidi: true,
      ouvertSoir: false,
      capacite: 600,
      affluenceActuelle: 82,
      menus: {
        lundi: {
          entrees: ["Salade piémontaise", "Velouté de légumes anciens bio", "Terrine de campagne artisanale"],
          plats: [
            { nom: "Cuisse de poulet fermier rôtie au paprika", type: "viande", label: "Volaille d'Auvergne" },
            { nom: "Lieu noir meunière aux câpres", type: "poisson", label: "Pêche durable" },
            { nom: "Galette de quinoa et patates douces aux épices", type: "vege", label: "Végétarien" }
          ],
          accompagnements: ["Riz safrané", "Carottes glacées au persil", "Frites"],
          desserts: ["Tartelette au citron meringuée", "Yaourt bio d'Auvergne", "Pomme bio"]
        },
        mardi: {
          entrees: ["Salade de pois chiches au cumin", "Carottes râpées", "Concombres à la crème d'aneth"],
          plats: [
            { nom: "Steak haché grillé façon bouchère sauce poivre", type: "viande", label: "100% Pur Bœuf" },
            { nom: "Gratin de la mer aux poireaux et crevettes", type: "poisson", label: "Fait maison" },
            { nom: "Wok de nouilles sautées aux légumes croquants et tofu", type: "vege", label: "Végétarien" }
          ],
          accompagnements: ["Pâtes coquillettes bio", "Haricots beurre persillés", "Purée maison"],
          desserts: ["Fondant au chocolat cœur coulant", "Fromage blanc", "Kiwi de France"]
        },
        mercredi: {
          entrees: ["Tomates mozzarella au basilic", "Salade de chou rouge aux noix", "Soupe à l'oignon gratinée"],
          plats: [
            { nom: "Blanquette de veau à l'ancienne", type: "viande", label: "Viande Française" },
            { nom: "Pavé de merlu au coulis de crustacés", type: "poisson", label: "Pêche durable" },
            { nom: "Curry vert de légumes et riz jasmin", type: "vege", label: "Végétarien" }
          ],
          accompagnements: ["Riz créole", "Chou-fleur braisé", "Pommes sautées"],
          desserts: ["Crème brûlée vanille", "Compote bio pomme châtaigne", "Clémentine"]
        },
        jeudi: {
          entrees: ["Salade mixte aux graines de tournesol", "Céleri rémoulade", "Velouté de champignons"],
          plats: [
            { nom: "Tajine de poulet aux citrons confits et olives", type: "viande", label: "Fait maison" },
            { nom: "Filet d'églefin au beurre blanc nantais", type: "poisson", label: "Pêche durable" },
            { nom: "Gratin de macaroni au fromage d'Auvergne et courge", type: "vege", label: "Végétarien" }
          ],
          accompagnements: ["Semoule fine", "Légumes couscous", "Salade verte"],
          desserts: ["Panna cotta coulis fruits rouges", "Fromage Bleu d'Auvergne AOP", "Orange"]
        },
        vendredi: {
          entrees: ["Salade de lentilles vertes du Puy", "Betteraves rouges", "Salade grecque"],
          plats: [
            { nom: "Filet de saumon sauce hollandaise", type: "poisson", label: "Label Rouge" },
            { nom: "Escalope de dinde panée viennoise", type: "viande", label: "Volaille Française" },
            { nom: "Burger végétarien steak de lentilles & frites", type: "vege", label: "Végétarien" }
          ],
          accompagnements: ["Frites croustillantes", "Épinards à la crème", "Riz basmati"],
          desserts: ["Tarte aux poires amandine", "Mousse café", "Yaourt aux fruits"]
        }
      }
    },
    {
      id: "dunant",
      nom: "Resto U Le Dunant (Médecine / Pharma)",
      campus: "Campus Dunant Santé · Place Dunant",
      adresse: "28 Place Henri Dunant, 63000 Clermont-Ferrand",
      type: "resto",
      horairesMidi: "11h30 - 13h45",
      horairesSoir: "Fermé le soir",
      ouvertMidi: true,
      ouvertSoir: false,
      capacite: 450,
      affluenceActuelle: 71,
      menus: {
        lundi: {
          entrees: ["Salade de pâtes au pesto", "Carottes râpées bio", "Potage julienne"],
          plats: [
            { nom: "Émincé de bœuf mariné aux oignons rouges", type: "viande", label: "Bœuf Français" },
            { nom: "Dos de lieu noir sauce ciboulette", type: "poisson", label: "Pêche durable" },
            { nom: "Tian provençal de légumes et galette de sarrasin", type: "vege", label: "Végétarien" }
          ],
          accompagnements: ["Pommes vapeur persillées", "Haricots verts", "Boulgour bio"],
          desserts: ["Flan pâtissier maison", "Fruit bio", "Fromage Cantal"]
        },
        mardi: {
          entrees: ["Salade de riz façon niçoise", "Betteraves vinaigrette", "Velouté de potiron"],
          plats: [
            { nom: "Cuisse de canard confite aux herbes", type: "viande", label: "Sud-Ouest" },
            { nom: "Poisson pané croustillant au citron", type: "poisson", label: "MSC Pêche durable" },
            { nom: "Curry de lentilles corail au lait de coco", type: "vege", label: "Végétarien" }
          ],
          accompagnements: ["Frites au four", "Courgettes persillées", "Riz blanc"],
          desserts: ["Mousse au chocolat", "Pomme du Limousin", "Yaourt fermier"]
        },
        mercredi: {
          entrees: ["Concombres tzatziki", "Salade d'endives aux noix", "Soupe de légumes"],
          plats: [
            { nom: "Rôti de porc au jus de sauge", type: "viande", label: "Porc Auvergnat" },
            { nom: "Filet de cabillaud poché court-bouillon", type: "poisson", label: "Pêche responsable" },
            { nom: "Chili végétarien aux haricots noirs et avocat", type: "vege", label: "Végétarien" }
          ],
          accompagnements: ["Purée grand-mère", "Brocolis vapeur", "Riz complet"],
          desserts: ["Tarte aux quetsches", "Faisselle au miel", "Banane bio"]
        },
        jeudi: {
          entrees: ["Taboulé au persil", "Salade verte et croûtons ail", "Potage tomate basilic"],
          plats: [
            { nom: "Poulet basquaise aux poivrons confits", type: "viande", label: "Volaille d'Auvergne" },
            { nom: "Pavé de colin au beurre citronné", type: "poisson", label: "Pêche durable" },
            { nom: "Lasagnes maison épinards ricotta", type: "vege", label: "Végétarien" }
          ],
          accompagnements: ["Riz pilaf", "Poêlée méridionale", "Tagliatelles fraîches"],
          desserts: ["Crème au chocolat noisette", "Salade d'oranges fraîches", "Yaourt nature"]
        },
        vendredi: {
          entrees: ["Salade mimosa", "Carottes au jus d'orange", "Velouté de cresson"],
          plats: [
            { nom: "Filet de merlu rôti sauce dieppoise", type: "poisson", label: "Pêche durable" },
            { nom: "Bavette d'aloyau grillée aux échalotes", type: "viande", label: "Bœuf Français" },
            { nom: "Risotto crémeux au parmesan et petits pois", type: "vege", label: "Végétarien" }
          ],
          accompagnements: ["Frites fraîches", "Tomate provençale", "Quinoa bio"],
          desserts: ["Tiramisu café", "Fromage Saint-Nectaire", "Poire bio"]
        }
      }
    },
    {
      id: "staps",
      nom: "Cafétéria Sciences & STAPS Cézeaux",
      campus: "Bâtiment STAPS / Cézeaux",
      adresse: "Campus Cézeaux, 63170 Aubière",
      type: "cafe",
      horairesMidi: "08h00 - 16h30 (Service continu)",
      horairesSoir: "Fermé le soir",
      ouvertMidi: true,
      ouvertSoir: false,
      capacite: 320,
      affluenceActuelle: 44,
      menus: {
        lundi: {
          entrees: ["Sandwich baguette poulet crudités", "Wrap thon mayonnaise et tomates", "Salade César croustillante"],
          plats: [
            { nom: "Panini chaud 3 fromages d'Auvergne (Cantal, Bleu, Saint-Nectaire)", type: "vege", label: "Spécialité Régionale" },
            { nom: "Burger étudiant bœuf fermier et frites chaudes", type: "viande", label: "100% Local" },
            { nom: "Poke bowl saumon bio, edamame, avocat et riz sésame", type: "poisson", label: "Formule Énergie" }
          ],
          accompagnements: ["Frites fraîches", "Mini salade verte", "Chips artisanales d'Auvergne"],
          desserts: ["Muffin pépites de chocolat", "Cookie avoine et canneberges", "Boisson fraîche 33cl", "Smoothie maison fruits rouges"]
        },
        mardi: {
          entrees: ["Sandwich jambon de pays Cantal", "Wrap poulet curry doux", "Salade grecque fraîcheur"],
          plats: [
            { nom: "Panini jambon blanc mozzarella origan", type: "viande", label: "Cuit sur place" },
            { nom: "Pâtes box bolognaise ou carbonara au choix", type: "viande", label: "Formule Rapide" },
            { nom: "Pâtes box pesto verde et tomates séchées bio", type: "vege", label: "Végétarien" }
          ],
          accompagnements: ["Frites au sel de Guérande", "Salade coleslaw", "Pommes dauphines"],
          desserts: ["Donut chocolat", "Compote nomade bio", "Brownie pécan", "Fruit de saison"]
        },
        mercredi: {
          entrees: ["Baguette rôtie dinde moutarde", "Wrap végétarien houmous et légumes grillés", "Salade piémontaise"],
          plats: [
            { nom: "Croque-monsieur gratiné au Comté", type: "viande", label: "Fait maison" },
            { nom: "Quiche lorraine traditionnelle ou saumon épinards", type: "poisson", label: "Artisanal" },
            { nom: "Burger végétarien galette lentilles oignons confits", type: "vege", label: "Végétarien" }
          ],
          accompagnements: ["Frites", "Salade roquette", "Velouté chaud en gobelet"],
          desserts: ["Tartelette framboises", "Gaufre liégeoise au sucre", "Boisson chaude expresso bio", "Cookie chocolat blanc"]
        },
        jeudi: {
          entrees: ["Sandwich poulet rôti mayonnaise", "Wrap bœuf mariné tex-mex", "Salade thaï au sésame"],
          plats: [
            { nom: "Panini chèvre chaud miel et noix d'Auvergne", type: "vege", label: "Végétarien" },
            { nom: "Pâtes box curry de volaille et ananas", type: "viande", label: "Chaud à emporter" },
            { nom: "Bowl falafels croustillants, quinoa et sauce yaourt menthe", type: "vege", label: "Végétarien" }
          ],
          accompagnements: ["Frites croustillantes", "Petite salade composée", "Chips de légumes"],
          desserts: ["Cheesecake coulis mangue", "Yaourt à boire", "Muffin myrtilles", "Fruit frais"]
        },
        vendredi: {
          entrees: ["Sandwich thon mayonnaise crudités", "Wrap saumon fumé aneth", "Salade italienne penne tomates"],
          plats: [
            { nom: "Fish burger cabillaud pané et sauce tartare maison", type: "poisson", label: "Pêche durable" },
            { nom: "Croque-monsieur chèvre épinards végétarien", type: "vege", label: "Végétarien" },
            { nom: "Hot-dog géant saucisse d'Alsace et oignons frits", type: "viande", label: "Classique" }
          ],
          accompagnements: ["Frites dorées", "Salade verte", "Nachos et guacamole"],
          desserts: ["Éclair café", "Pomme bio", "Barre céréales bio", "Chocolat chaud viennois"]
        }
      }
    }
  ];

  /* Détermine si un restaurant est actuellement ouvert selon l'heure */
  function getStatusNow(resto) {
    const now = new Date();
    const day = now.getDay(); // 0 = Dimanche, 6 = Samedi
    const hour = now.getHours();
    const min = now.getMinutes();
    const hm = hour * 60 + min;

    // Week-end : fermés
    if (day === 0 || day === 6) {
      return { ouvert: false, label: "Fermé le week-end", color: "danger", badge: "🔴 Fermé" };
    }

    if (resto.type === "cafe") {
      // 8h00 (480) à 16h30 (990)
      if (hm >= 480 && hm <= 990) {
        return { ouvert: true, label: "Ouvert · Service continu jusqu'à 16h30", color: "success", badge: "🟢 Ouvert" };
      } else if (hm < 480) {
        return { ouvert: false, label: "Ouvre à 08h00 ce matin", color: "warning", badge: "🟠 Bientôt ouvert" };
      } else {
        return { ouvert: false, label: "Fermé · Réouverture demain 08h00", color: "danger", badge: "🔴 Fermé" };
      }
    }

    // Resto U midi : 11h30 (690) à 14h00 (840)
    const isMidi = hm >= 690 && hm <= 840;
    // Soir : 18h45 (1125) à 20h30 (1230)
    const isSoir = resto.ouvertSoir && (day !== 5) && hm >= 1125 && hm <= 1230;

    if (isMidi) {
      const restMin = 840 - hm;
      return { ouvert: true, label: `Ouvert service midi · Ferme dans ${restMin} min`, color: "success", badge: "🟢 Ouvert" };
    }
    if (isSoir) {
      const restMin = 1230 - hm;
      return { ouvert: true, label: `Ouvert service soir · Ferme dans ${restMin} min`, color: "success", badge: "🟢 Ouvert" };
    }
    if (hm < 690) {
      const wait = 690 - hm;
      return { ouvert: false, label: `Ouvre pour le déjeuner dans ${wait} min (11h30)`, color: "warning", badge: "🟠 Ouvre bientôt" };
    }
    if (hm > 840 && hm < 1125 && resto.ouvertSoir && day !== 5) {
      return { ouvert: false, label: "Fermé · Réouverture ce soir à 18h45", color: "danger", badge: "🔴 Fermé" };
    }
    return { ouvert: false, label: "Fermé pour la journée · Réouverture demain", color: "danger", badge: "🔴 Fermé" };
  }

  function getDayKey(date) {
    const d = date || new Date();
    const day = d.getDay();
    const keys = ["lundi", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "lundi"];
    return keys[day] || "lundi";
  }

  function getRestoById(id) {
    return CROUS_RESTOS.find((r) => r.id === id) || CROUS_RESTOS[0];
  }

  root.UCA_CROUS = {
    restos: CROUS_RESTOS,
    getStatusNow,
    getDayKey,
    getRestoById
  };
})(typeof window !== "undefined" ? window : globalThis);
