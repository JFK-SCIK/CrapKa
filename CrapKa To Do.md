Bugs

* Vérifier que seule 1 carte peut être demandée, pas deux, et seulement une carte qui était jouable à la fin du tour de l'adversaire dans crapka\_2026-03-29\_10-30-44 il demande le 10 et le 8 de dessous (probablement car la pile est marquée demandable, pas la carte). Faire l'animation sur la carte demandée pas sur la plus basse de la pile
* On ne défausse jamais en laissant une pile non retournée sauf si 2 (ou 3) en crapette, pas d'as et as visible sans 2 (ou 3) visible chez l'adversaire
* crapka\_2026-03-29\_10-36-17 illustre le fait que l'ia joue souvent un coup inutile avant de jouer sa crapette

  * 178.0#8(Ma)->P4|R(Ma)->P1|5(Cr)->P1\*|R(Ma)->P4|3(Ma)->Df4
  * 159.0#R(Ma)->P1|5(Cr)->P1\*|8(Ma)->P4|3(Ma)->Df4
* R sur défausse n'est pas un coup jouable (à ne pas mettre dans les séquences)



Priorités à modifier :

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





Divers

* Mettre une animation pour la victoire
* Mettre les Piles alignées verticalement avec les jeux
* Permettre de déplacer le slider sans réduction de taille des cartes tant que touche pas le bord droit de la zone de recyclage
* Supprimer bouton BF
* Mettre les menus et autres widget sous CrapKa
* Faire un bouton "règles" avec les crédits à A\&S
* Voir si  ce serait pas mieux de sauvegarder partie et paramètre dans un cookie
* Snapshot copie directement et affiche un bref message "SnapShot terminé"

