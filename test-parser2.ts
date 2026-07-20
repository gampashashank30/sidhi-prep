import { parseQuestions, extractParagraphs } from './lib/parser';

const text = `
Q1.If x = 4 + √1 5 , what is the value of (x^2+1/x^2 )?
A.48
B.54
C.72
D.62
Ans:D
Exp:The solution is
If x = 4 + √1 5
1/x= 4-√15
x+1/x=4 + √1 5+4-√15
x+1/x=8
x^2+1/x^2 =8^2-2=62
Subject:Maths > Advance Maths > Algebra
Difficulty:Easy

Q2.If 8k^6+15k^3-2=0, then the positive value of (k+1/k) is?
A.2 1/2
B.2 1/8
C.8 1/2
D.8 1/8
Ans:A
Exp:The solution is
Given that 8k^6+15k^3-2=0
8k^6+16k^3-k^3-2=0
8k^3 (k^3+2)-1(k^3+2)=0
(8k^3-1)(k^3+2)=0
∴8k^3=1So, k=1/2
The value of k+1/k is
k+1/k=2+1/2= 21/2
Subject:Maths > Advance Maths > Algebra
Difficulty:Easy

Q3.X is a negative number such thatk+k^(-1)= -2 , then what is the value of (k^2+4k-2)/(k^2+k-5)
A.7
B.1
C.-7
D.-1
Ans:B
Exp:The solution is
k+1/k=-2
∴k=-1
On substituting k value in the given equation,
∴(k^2+4k-2)/(k^2+k-5)=((-〖1)〗^2+4(-1)-2)/(〖(-1)〗^2-1-5)
(1-4-2)/(1-1-5)= (-5)/(-5)=1
Subject:Maths > Advance Maths > Algebra
Difficulty:Easy

Q4.If (x^2+1/x^2 )=7 , and 0 < x <1 , find the value of x^2-1/x^2 
A.3√5
B.4√3
C.-4√3
D.-3√5
Ans:A
Exp:The solution is
Given that, (x^2+1/x^2 )=7 
On adding 2 on both sides, 	
(x^2+1/x^2 )+2 = 7+2
(x+1/x)^2= 9
x+1/x=√9=3
(x^2+1/x^2 )=7
On subtracting 2 on both sides,
(x^2+1/x^2 )-2 = 7-2
█(&@&(x-1/x)^2=5@&x-1/x=√5@&■(x^2-1/x^2 &=(x+1/x)(x-1/x)@&))
=(3)(√5)
=3√5
Subject:Maths > Advance Maths > Algebra
Difficulty:Easy









Q5.If (x-1/x)=-6 , what will be the value of (x^5-1/x^5 )?
A.-8898
B.-8886
C.-8896
D.-8892
Ans:B
Exp:The solution is
█(x^3-1/x^3 &=(-6)^3+3(-6)@&=-216-18=-234@x^2+1/x^2 &=(-6)^2+2=38@(x^5-1/x^5 )&=(x^2+1/x^2 )(x^3-1/x^3 )  -(x-1/x)@&@=38(-234)-(-6)@=-8892+6@=-8886)
Subject:Maths > Advance Maths > Algebra
Difficulty:Medium
Q6.If, for a non-zerox , 5x^2+7x+5=0, then the value of x^3+1/x^3  is:
A.896/125
B.532/343
C.125/532
D.182/125

Ans:D
Exp:The solution is
Divide the equation on both sides by 5x. 
Then the equation becomesx+1/x  =- 7/5
x^3+1/x^3 =(-343)/125-3×((-7)/5)
= 182/125
Subject:Maths > Advance Maths > Algebra
Difficulty:Easy
Q7.If 7b-1/4b=7, then what is the value of 16b^2+1/(49b^2 )?
A.80/49
B.107/4
C.120/7
D.7/2
Ans:C
Exp:The solution is 
Given equation 7b-1/4b=7, on multiplying both sides with 4/7
█(&■(&4/7 (7b-1/4b)=4/7×7@&4b-1/7b=4)@&" Square both sides " @&■(&16b^2+1/(49b^2 )-2×4b×1/7b=16@&16b^2+1/(49b^2 )=16+8/7=120/7))
Subject:Maths > Advance Maths > Algebra
Difficulty:Medium

Q8.If x > 0, and x^4+1/x^4 =254, what is the value of x^5+1/x^5 
A.717√2
B.723√2
C.720√2
D.726√2
Ans:A
Exp:The solution is
█(&x^4+1/x^4 =254@&x^2+1/x^2 =√(254+2)=16@&x+1/x=√(16+2)=√18=3√2@&(x^5+1/x^5 )=(x^3+1/x^3 )(x^2+1/x^2 )-(x+1/x)@@&x^3+1/x^3 =(3√2 )^3-3×3√2@&=54√2-9√2=45√2@&∴x^5+1/x^5 =45√2×16-3√2@&=720√2-3√2=717√2)
Subject:Maths > Advance Maths > Algebra
Difficulty:Medium

Q9.If (a + b – c) = 20, anda^2+b^2+c^2=152, find the value of a^3+b^3-c^3+3abc.
A.480
B.720
C.640
D.560
Ans:D
Exp:The solution is
As we know, 
█(&@ab-bc-ca=&((a+b-c)^2-(a^2+b^2+c^2 ))/2@ab-bc-ca=(400-152)/2=124@&@a^3+b^3-c^3+3abc=(a+b-c)×[a^2+b^2+c^2-(ab-bc-ca) ]@&@&)
=20(152-124)
=20×28
=560
Subject:Maths > Advance Maths > Algebra
Difficulty:Medium

Q10.The value of ((p-q)^3+(q-r)^3+(r-p)^3)/12(p-q)(q-r)(r-p) , wherep≠ q ≠ r, is equal to:
A.1/9
B.1/3
C.1/4
D.1/2
Ans:C
Exp:The solution is
" If " a+b+c=0" then " a^3+b^3+c^3=3abc
Here, a=(p-q)  ; b=(q-r)  ; c=(r-p)
█(&@&@&@&∴((p-q)^3+(q-r)^3+(r-p)^3)/12(p-q)(q-r)(r-p)   =3(p-q)(q-r)(r-p)/12(p-q)(q-r)(r-p) =1/4)
Subject:Maths > Advance Maths > Algebra
Difficulty:Easy

Q11.The value of ((x-y)^3+(y-z)^3+(z-x)^3)/6(x-y)(y-z)(z-x) , where x≠y≠z, is equal to:
A.1/4
B.1/2
C.1/3
D.1/9
Ans:B
Exp:The solution is
Let x – y = a ; y – z = b ;z – x = c
a + b + c = x – y + y – z + z – x = 0
if a + b + c = 0, 
a^3+b^3+c^3=3abc
((x-y)^3+(y-z)^3+(z-x)^3)/6(x-y)(y-z)(z-x)   = (a^3+b^3+c^3)/6abc=3abc/6abc
=1/2
Subject:Maths > Advance Maths > Algebra
Difficulty:Easy

Q12.a^2+b^2+c^2=ab+bc+ca, then the value of (11a^4+13b^4+17c^4)/(17a^2 b^2+9b^2 c^2+15c^2 a^2 ) is :
A.1
B.2
C.11
D.4
Ans:A
Exp:The solution is
Put a = b = c = 1 in the given equation(11a^4+13b^4+17c^4)/(17a^2 b^2+9b^2 c^2+15c^2 a^2 )
(11+13+17)/(17+9+15)=41/41= 1
Subject:Maths > Advance Maths > Algebra
Difficulty:Easy

Q13.If x - y + z = 0, then find the value of y^2/2xz-x^2/2yz-z^2/2xy
A.3/2
B.1/2
C.-6
D.-3/2
Ans:A
Exp:The solution is
Given that, x - y + z = 0
Then x^3-y^3+z^3=-3xyz ;
Given equation y^2/2xz-x^2/2yz-z^2/2xy = (y^3-x^3-z^3)/2xyz
=-((x^3-y^3+z^3 ))/2xyz  =- ((-3xyz))/2xyz
 = 3/2
Subject:Maths > Advance Maths > Algebra
Difficulty:Medium

Q14.If 2p + q =19 and 8p^3+q^3=361, then find the value of pq.
A.56
B.59
C.58
D.57
Ans:D
Exp:The solution is
As we know a^3+b^3=(a+b)(a^2+b^2-ab)
█(&(2p)^3+q^3=(2p+q)(4p^2+q^2-2pq)@&8p^3+q^3=19[(2p+q)^2-6pq]@&361=19[361-6pq]@&19=361-6pq@&6pq=361-19@&pq=342/6=57)
Subject:Maths > Advance Maths > Algebra
Difficulty:Medium











Q15.If 6√6 p^3+2√2 q^3=(√6 p+√2 q)(Sp^2+Mq^2-Npq), then the positive value of √(S^2+M^(2+) 〖2N〗^2 ) is :
A.10
B.8
C.9
D.12
Ans:B
Exp:The solution is
█(&■(&(√6 p)^3+(√2 q)^3=(√6 p+√2 q)[6p^2+2q^2-√12 pq]@&)@&" compare with right hand side from the given equation," @&■(&S=6 ; M=2  ; N=√12@&⇒√(S^2+M^2+2N^2 )@&=√(36+4+24)=√64=8))
Subject:Maths > Advance Maths > Algebra
Difficulty:Easy

Q16.If 1/(x^2+a^2 )= x^2-a^2, then the value of x is:
A.(1-a^4 )^(1⁄4)
B.a
C.(a^4-1)^(1⁄4)
D.(a^4+1)^(1⁄4)
Ans:D
Exp:The solution is
Given that,
█(&1/(x^2+a^2 )=x^2-a^2@&1=(x^2-a^2 )(x^2+a^2 )@&1=x^4+x^2 a^2-x^2 a^2-a^4@&1=x^4-a^4@&x^4=a^4+1⇒(a^4+1)^(1/4) )

Subject:Maths > Advance Maths > Algebra
Difficulty:Easy
Q17.Which of the following statement is correct?
	If k+1/k=12 , then (k^2+1/k^2 )=142
	(k^2+1/k^2 )(k-1/k)(k^4+1/k^4 )(k+1/k)=k^16-1/k^16 
A.Only 1
B.Neither 1 nor 2
C.Both 1 and 2
D.only 2
Ans:A
Exp:The solution is
█(&■(&I→K+1/K=12@&K^2+1/K^2 =〖12〗^2-2=142)@&"∴ Statement I is true." @&■(&II→(K^2+1/K^2 )(K-1/K)(K^4+1/K^4 )(K+1/K)@&@&⇒(K^2-1/K^2 )(K^2+1/K^2 )(K^4+1/K^4 )@&⇒(K^4-1/K^4 )(K^4+1/K^4 )  = (K^8-1/K^8 ) ))
"∴" Statement II is not true  
So , only I is correct answer.
Subject:Maths > Advance Maths > Algebra
Difficulty:Easy

Q18.If p=7+4√3, then what is the value of (p^6+p^4+p^2+1)/p^3  ?
A.2617
B.2267
C.2716
D.2176
Ans:D
Exp:The solution is
█(&■(&P=7+4√3@&1/P=7-4√3@&P+1/P=14@&divide the Nu and De of given equation,(P^6+P^4+P^2+1)/P^3  byP^3 )@&@&■(&then it becomes (P^3+P+1/P+1/P^3 )/1@&⇒(P^3+1/P^3 )+(P+1/P)@&⇒(〖14〗^3-3×14)+14@&⇒2744-42+14=2716))
Subject:Maths > Advance Maths > Algebra
Difficulty:Medium

Q19.Which of the following statement is correct?
	█(&@&■(&〖100〗^2-〖99〗^2+〖98〗^2-〖97〗^2+〖96〗^2-〖95〗^2+⋯……+2^2-1^2=5050.@&@&))
	8x+8/x=16,x<0,x^197+x^197=2
A.Only 1
B.Both 1 and 2
C.Neither 1 nor 2
D.Only 2
Ans:A
Exp:The solution is
I→〖100〗^2-〖99〗^2+〖98〗^2-〖97〗^2+〖96〗^2-〖95〗^2+⋯……+2^2-1^2
since a^2-b^2=(a-b)(a+b)
we can write the given equation in above form. It becomes,
(100−99)(100+99)+(98−97)(98+97)+⋯+(2−1)(2+1)
= 199+195+191+……+7+3
Sum= n/2 [2a+(n-1)d]
=25[2×199+49(-4) ]
=25(398-196) =5050
∴"Statement I is true" 
II→8x+█(@8)/x=-16
8(x+1/x)=-16
x+1/x=-2
∴x=-1
∴x^197+1/x^197 =-1+1/(-1)
⇒-1-1=-2
∴"Statement Only I is true." 
Subject:Maths > Advance Maths > Algebra
Difficulty:Medium
`;

const paragraphs = extractParagraphs(text);
const result = parseQuestions(paragraphs);
console.log(JSON.stringify(result, null, 2));
