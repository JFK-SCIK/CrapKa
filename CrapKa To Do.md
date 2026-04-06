* Amélioration : choix pose R de crapette
- exemple : crapka_2026-04-06_09-36-36 - choix de pose de R crapette mauvais
- Critères de choix :
  - maximiser les chances de vider la future crapette
      - bonus très important pour une séquence qui permettra de vider la main après la pose de la crapette
      - bonus important pour le nombre de cartes jouables en main et après la pose de la crapette
      - bonus moyen pour le nombre de cartes de défausse jouables après la pose de la crapette
      - bonus faible pour le nombre de cartes différentes sur les piles après la pose du R
      - bonus très faible pour jouer sur des piles élevées 
  - empecher la pose de la crapette adverse
      - bonus si une séquence incluant le R crapette élimine une pile où l'adversaire aurait pu poser sa crapette et qu'il n'y a pas d'autre pile au même niveau. Le bonus est plus important quand la carte de crapette de l'adversaire est petite. Le calcul doit bonifier le cas ou on fait disparaitre une pile sans mettre d'as quand l'adversaire a une petite carte(<=4) en crapette 
      - malus si le R diminue la distance min entre les piles et la crapette adverse et que cette distance est <= 5
  - permettre de vider la main, totalement ou partiellement
      - bonus important pour une séquence incluant R crapette qui permet de vider la main
      - bonus moyen pour une séquence incluant R crapette qui permet de vider le max de cartes de la main
  - permettre de dégager des cartes de la défausse
      - bonus léger si 


A vérifier par JFK
* Roi en main en fin de tour pas assez fort car moins priorisé que pose de 3 cartes de la main -> le roi en main doit avoir une meilleure priorité que 1 et plus carte en main mais moins que vider sa main
* choix de la colonne de défausse : objectif maximiser la disponibilité des cartes sur le chemin de la crapette

  * Maximiser le nb de cartes nécessaire à la crapette et non en main visibles
  * Maximiser le nb de cartes accessibles
  * Privilégier m sur m
  * Ne pas masquer une carte n avec une autre carte m si colonne dispo et si m<>n-1 et pas de m en main
  * Privilégier la pose de n sur n+1
  * Eviter n sur m plus petit
  * Eviter As sur <> As





Bugs à vérifier par JFK :

* Vérifier que seule 1 carte peut être demandée, pas deux, et seulement une carte qui était jouable à la fin du tour de l'adversaire dans crapka\_2026-03-29\_10-30-44 il demande le 10 et le 8 de dessous (probablement car la pile est marquée demandable, pas la carte). Faire l'animation sur la carte demandée pas sur la plus basse de la pile
* On ne défausse jamais en laissant une pile non retournée sauf si 2 (ou 3) en crapette, pas d'as et as visible sans 2 (ou 3) visible chez l'adversaire
* crapka\_2026-03-29\_10-36-17 illustre le fait que l'ia joue souvent un coup inutile avant de jouer sa crapette

  * 178.0#8(Ma)->P4|R(Ma)->P1|5(Cr)->P1\*|R(Ma)->P4|3(Ma)->Df4
  * 159.0#R(Ma)->P1|5(Cr)->P1\*|8(Ma)->P4|3(Ma)->Df4
* R sur défausse n'est pas un coup jouable (à ne pas mettre dans les séquences)



Priorités à vérifier par JFK :

* Repiocher sa main sans défausser > défausser et garder des rois en main
* Si on doit défausser, on évalue la main résiduelle. Priorités

  * Bonus

    * Nombre de rois dans la main (1 roi > critère taille main à 0)
    * Cartes en un exemplaire dans la séquence de x cartes menant à la crapette x = min( 5 , distance Pile i avec crapette )
    * Cartes
  * Malus

    * Carte de la crapette en main
    * Carte en double en main
    * Carte en main
* Vérifier comment traiter : jouer une carte qui aide l'adversaire à poser sa crapette = carte non visible chez l'adversaire et dans la séquence de x cartes menant à la crapette adverse x = min( 5 , distance Pile i avec crapette )



Divers à faire

* Mettre une animation pour la victoire : les cartes du joueur gagnant s'envolent et laisse place à un "Victoire !" clignotant jusqu'à ce qu'un clic soit fait
* En début de partie, mettre un message "x commence" avec un ok, pour permettre d'activer le mode debug ou de sauvegarder si c'est à l'IA de jouer



A améliorer un jour

* Permettre de déplacer le slider sans réduction de taille des cartes tant que touche pas le bord droit de la zone de recyclage : aujourd'hui s'arête bien avant
* Localisation de la sauvegarde



Fait :

* Supprimer bouton BF
* Mettre les menus et autres widget sous CrapKa
* Faire un bouton "règles" avec les crédits à A\&S
* Snapshot copie directement et affiche un bref message "SnapShot terminé"



